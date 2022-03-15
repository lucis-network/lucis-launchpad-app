import {gql, ServerError, ServerParseError} from "@apollo/client";
import {message} from "antd";
import {useInput} from "hooks/common/use_input";
import {useEffect, useState} from "react";
import {GBoxCampaignRound, GBoxPrice, GBoxType,} from "src/generated/graphql";
import apoloClient, {onApolloError} from "utils/apollo_client";
import {debounce} from "@github/mini-throttle";

import EthersService from "services/blockchain/Ethers";
import {nonReactive as ConnectWalletStore_NonReactiveData} from "components/Auth/ConnectWalletStore";
import {ChainNetwork, GQL_Currency} from "../../utils/blockchain/BlockChain";
import {GraphQLError} from "graphql";
import {AppEmitter} from "../../services/emitter";
import ApprovalStore, {ETHER_MIN_ALLOWANCE} from "../../components/Auth/Blockchain/ApprovalStore";
import {Transaction} from "ethers";


export enum BuyDisabledReason {
  WalletNotConnected,
  SoldOut,
  WhitelistNotRegistered,
  NotSaleRound,
}

const _callFnDebounced = debounce(
  (fn: () => void) => {
    fn();
  },
  2000,
  {start: false}
);

export function useBuyBox(
  boxType: GBoxType,
  round: GBoxCampaignRound | undefined,
  isInWhitelist: boolean | undefined,
  connectedChainNetwork: ChainNetwork | undefined,
  isLoggedIn: boolean,
) {
  // Lib Bug: loading is always true after mutate with error, so plz use promise approach instead
  // const [buyBox, { data, loading, error }] = useMutation(BUY_BOX_MUT);

  const [loading, setLoading] = useState(false);
  const [currencyEnabled, setCurrencyEnabled] = useState(false);

  const chainSymbol = connectedChainNetwork;


  // get first matched box on connected chain (if connected)
  let boxPrice: GBoxPrice | undefined =
    (boxType.prices?.length ?? 0) > 0
      ? boxType.prices!.find(
          (item) => item.currency.chain_symbol?.toLowerCase() == chainSymbol
        )
      : undefined;
  // else if no chain was connected, select first box
  if (!boxPrice) {
    if (boxType.prices?.length) {
      boxPrice = boxType.prices[0]
    }
  }

  /**
   * Re-fetch allowance info whenever the currency to buy box was changed
   * Must use debounce to avoid redundant blockchain request because
   * we're inside boxType, this page contain multiple boxTypes so
   * this will fire multiple request if you dont use debounce
   */
  useEffect(() => {
    if (!isLoggedIn) {
      // only check allowance if user connected the wallet and logged-in
      return;
    }

    const currency_symbol = boxPrice?.currency.symbol as GQL_Currency;
    _callFnDebounced(async () => {
      console.log('{UseBuyBox} <== re-fetch allowance for currency: ', currency_symbol);

      switch (currency_symbol) {
        case GQL_Currency.BUSD:
          ApprovalStore.busd_allowance = await checkAllowanceForBoxPrice()
          console.log('{UseBuyBox} ==> re-fetch allowance result: ', currency_symbol, ApprovalStore.busd_allowance);

          setCurrencyEnabled(ApprovalStore.isCurrencyEnabled(GQL_Currency.BUSD))
          break;
        case GQL_Currency.undefined:
          setCurrencyEnabled(false)
          break;
        default:
          throw new Error("{UseBuyBox} re-fetch allowance does handle currency: " + currency_symbol)
      }
    })
  }, [isLoggedIn, boxPrice?.currency.symbol])




  const requireWhitelist = round?.is_whitelist === false && round?.require_whitelist === true;


  // can buy box: in buy round + enough box to buy + registered whitelist if need + box left
  // @ts-ignore
  const isSaleRound = !round?.is_whitelist && !round?.is_abstract_round;

  let buyBtnDisabledReason: BuyDisabledReason | undefined = undefined;
  // const buyFormEnabled = isSaleRound
  //   && boxType.total_amount > boxType.sold_amount
  //   && (requireWhitelist ? isInWhitelist : true)
  // ;
  let buyFormEnabled = true;
  // if (!connectedChainNetwork) {
    /**
     * If wallet was not connect => Allow click buy but show modal to connect wallet
     */
    // buyFormEnabled = false
    // buyBtnDisabledReason = BuyDisabledReason.WalletNotConnected
  // } else
  if (!isSaleRound) {
    buyFormEnabled = false
    buyBtnDisabledReason = BuyDisabledReason.NotSaleRound
  }
  else if (!(boxType.sold_amount < boxType.total_amount)) {
    buyFormEnabled = false
    buyBtnDisabledReason = BuyDisabledReason.SoldOut
  } else if (!(requireWhitelist ? isInWhitelist : true)) {
    buyFormEnabled = false
    buyBtnDisabledReason = BuyDisabledReason.WhitelistNotRegistered
  }


  const txtAmount = useInput("");
  const [err, setErr] = useState<string | undefined>();


  const onBuyBoxError = (e: GraphQLError) => {
    // show message and handle
    console.log('{onBuyBoxError} e: ', e);
    const {message: msg} = e;
    if (msg === "Allowance not enough") {
      message.error(msg, 6)
      // TODO: call approval again
      alert("connect metamask to get approval")
    } else {
      message.error(msg, 6)
      // AppEmitter.emit('showConnectWalletModal')
    }
  };

  const onAuthError = (e: GraphQLError) => {
    // show connect wallet modal and message
    console.log('{onAuthError} e: ', e);
    message.error('Error: Unauthorized: Please connect and verify your wallet first!', 6)
    AppEmitter.emit('showConnectWalletModal')
  }

  const doBuyBox = async function () {
    if (!isLoggedIn) {
      message.error("Failed - You've not complete the verification!");
      return;
    }

    if (!boxPrice) {
      setErr("Box price not found!");
      return;
    }
    if (!round) {
      setErr("Round not found!");
      return;
    }
    if (round.require_whitelist === true && !isInWhitelist) {
      message.error(
        '<span>This box is for whitelisted user only</span>',
        3,
      );
      return;
    }

    const quantity = parseFloat(txtAmount.value ?? "0");
    if (!txtAmount.value || quantity <= 0) {
      txtAmount.setErr("Quantity must be greater than 0");
      return;
    }

    const maxPerUser = boxType.limit_per_user ?? 100; // default is 100 per user
    if (quantity > maxPerUser) {
      txtAmount.setErr(`A user can buy up to ${maxPerUser} boxes only`);
      return;
    }

    // console.log("round: ", round);
    setErr(undefined);

    console.log('==> {onBuyBox} input: ', {
      box_price_uid: boxPrice?.uid,
      round_id: round?.id ?? 0,
      quantity: quantity,
    });

    setLoading(true);

    // ensure allowance
    // const allowanceEnsured = await ensureAllowance();
    // if (!allowanceEnsured) {
    //   message.error(
    //     "Cannot ensure your allowance",
    //     6
    //   );
    //   return;
    // }
    // This is not good UX, and will be changed to:
    // - If user don't have allowance => replace the Buy button by `Enable BUSD` (currency) button
    // - User have enabled (approve allowance for BUSD) => Enable Buy button

    // request buy box async, allowance is ensured at this time
    return buyBox(boxPrice?.uid, round?.id ?? 0, quantity)
      .then(res => {
        console.log('{onBuyBox.res} res: ', res);
      })
      .catch((err) => {
        onApolloError(
          err,
          onBuyBoxError,
          onAuthError,
          (e: Error | ServerParseError | ServerError) => {
            console.error('{onBuyBox.onNetworkError} e: ', e);
          },
        )
      })
      .finally(() => {
        setLoading(false);
      });
  };

  // const ensureAllowance = async function (): Promise<boolean> {
  //   if (!(await hasEnoughAllowanceForBoxPrice())) {
  //     // Request approval
  //     return requestAllowanceForBoxPrice();
  //   }
  //
  //   return true;
  // };

  const checkAllowanceForBoxPrice = async (): Promise<number> => {
    if (!isLoggedIn) {
      message.warn("Please connect wallet and verify your address first!");
      return 0;
    }

    if (!ConnectWalletStore_NonReactiveData.web3Provider) {
      message.error(
        "[Critical] This is unexpected behavior occur in our app, please reconnect your wallet to ensure the app run correctly",
        6
      );
      return 0;
    }

    const nft_contract_address = boxPrice?.contract?.address ?? '';
    const currency_address = boxPrice?.currency.address ?? ''; // address of token to buy
    const ethersService = new EthersService(ConnectWalletStore_NonReactiveData.web3Provider);

    // check enough allowance
    const allowanceWei = await ethersService.getMyAllowanceOf(nft_contract_address, currency_address)
    if (allowanceWei == null) {
      const msg = "Cannot ensure the allowance";
      console.error(msg, {nft_contract_address, currency_address, allowanceWei});
      // message.error(msg, 6);
      return 0;
    }

    return allowanceWei;
  }

  const hasEnoughAllowanceForBoxPrice = async () => {
    return await checkAllowanceForBoxPrice() >= ETHER_MIN_ALLOWANCE
  }

  const requestAllowanceForBoxPrice = async () => {
    if (!isLoggedIn) {
      message.warn("Please connect wallet and verify your address first!");
      return false;
    }

    if (!ConnectWalletStore_NonReactiveData.web3Provider) {
      message.error(
        "[Critical] This is unexpected behavior occur in our app, please reconnect your wallet to ensure the app run correctly",
        6
      );
      return false;
    }


    const nft_contract_address = boxPrice?.contract?.address ?? '';
    const currency_address = boxPrice?.currency.address ?? ''; // address of token to buy
    const ethersService = new EthersService(ConnectWalletStore_NonReactiveData.web3Provider);

    // Request approval
    return ethersService.requestApproval(nft_contract_address, currency_address);
  }

  return {
    loading,
    isSaleRound,
    buyFormEnabled,
    buyBtnDisabledReason,
    err,
    txtAmount,
    requireWhitelist,
    boxPrice,

    doBuyBox,
    hasEnoughAllowanceForBoxPrice,
    requestAllowanceForBoxPrice,
    currencyEnabled,
  };
}

const BUY_BOX_MUT = gql`
  mutation buyBox($input: BuyBoxInput!) {
    buyBox(input: $input)
  }
`;


async function buyBox(
  box_price_uid: string,
  round_id: number,
  quantity: number,
): Promise<any> {
  const res = await apoloClient.mutate({
    mutation: gql`
      mutation buyBox($input: BuyBoxInput!) {
        buyBox(input: $input)
      }
    `,
    variables: {
      input: {box_price_uid, round_id, quantity}
    }
  })

  return res
}
