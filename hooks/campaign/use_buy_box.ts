import { gql, ServerError, ServerParseError } from "@apollo/client";
import { message } from "antd";
import { useInput } from "hooks/common/use_input";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Coupon,
  GBoxCampaignRound,
  GBoxPrice,
  GBoxType,
} from "src/generated/graphql";
import apoloClient, { extractError, onApolloError } from "utils/apollo_client";
import { debounce } from "@github/mini-throttle";

import EthersService from "services/blockchain/Ethers";
import { nonReactive as ConnectWalletStore_NonReactiveData } from "components/Auth/ConnectWalletStore";
import { ChainNetwork, GQL_Currency } from "../../utils/blockchain/BlockChain";
import { GraphQLError } from "graphql";
import { AppEmitter } from "../../services/emitter";
import ApprovalStore, {
  ETHER_MIN_ALLOWANCE,
} from "../../components/Auth/Blockchain/ApprovalStore";
import { Transaction } from "ethers";
import { Web3ProviderErrorCodes } from "components/Auth/ConnectWalletHelper";
import AuthStore from "../../components/Auth/AuthStore";
import CampaignStore from "../../src/store/CampaignStore";
import { KMath } from "utils/math.helper";

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
  { start: false }
);

export function useBuyBox(
  boxType: GBoxType,
  round: GBoxCampaignRound | undefined,
  isInWhitelist: boolean | undefined,
  connectedChainNetwork: ChainNetwork | undefined,
  // isLoggedIn: boolean,
  purchasedBox?: GBoxType
) {
  // Lib Bug: loading is always true after mutate with error, so plz use promise approach instead
  // const [buyBox, { data, loading, error }] = useMutation(BUY_BOX_MUT);

  const [loading, setLoading] = useState(false);
  const txtAmount = useInput("");
  const txtCoupon = useInput("");
  const [err, setErr] = useState<string | undefined>();
  const [couponError, setCouponError] = useState<string>();
  const [coupon, setCoupon] = useState<Coupon>();
  // const [buyFormEnabled, setBuyFormEnabled] = useState(false)

  const chainSymbol = connectedChainNetwork;

  // get first matched box on connected chain (if connected)
  const boxPrice: GBoxPrice | undefined = useMemo(() => {
    let _boxPrice =
      (boxType.prices?.length ?? 0) > 0
        ? boxType.prices!.find(
            (item) => item.currency.chain_symbol?.toLowerCase() == chainSymbol
          )
        : undefined;
    // if no chain was connected, select first box
    if (!_boxPrice && boxType.prices?.length) {
      _boxPrice = boxType.prices[0];
    }
    return _boxPrice;
  }, [chainSymbol, boxType]);

  const isSupportedConnectedChain = useMemo(() => {
    return !!boxType.prices?.find(
      (item) =>
        item.currency?.chain_symbol?.toLowerCase() ===
        chainSymbol?.toString()?.toLowerCase()
    )
      ? true
      : false;
  }, [boxType, chainSymbol]);

  const currencyEnabled = !isSupportedConnectedChain
    ? true
    : ApprovalStore.isCurrencyEnabled(
        (boxPrice?.currency.symbol as GQL_Currency) ?? false
      );
  // TODO: setCurrencyEnabled on chain or symbol changed
  /**
   * Re-fetch allowance info whenever the currency to buy box was changed
   * Must use debounce to avoid redundant blockchain request because
   * we're inside boxType, this page contain multiple boxTypes so
   * this will fire multiple request if you dont use debounce
   */

  const checkAllowanceForBoxPrice = useCallback(async (): Promise<number> => {
    if (!AuthStore.isLoggedIn) {
      message.warn("Please connect wallet and verify your address first!");
      return 0;
    }

    if (!ConnectWalletStore_NonReactiveData.web3Provider) {
      message.error(
        "This is unexpected behavior occur in our app, please reconnect your wallet to ensure the app run correctly",
        6
      );
      return 0;
    }

    if (!isSupportedConnectedChain) {
      console.warn("Current change not supported to get allowance");
      return 0;
    }

    const nft_contract_address = boxPrice?.contract_address ?? "";
    const currency_address = boxPrice?.currency.address ?? ""; // address of token to buy
    const ethersService = new EthersService(
      ConnectWalletStore_NonReactiveData.web3Provider
    );
    console.log("nft_contract_address:", nft_contract_address);
    console.log("currency_address:", currency_address);
    // check enough allowance
    const allowanceWei = await ethersService.getMyAllowanceOf(
      nft_contract_address,
      currency_address
    );
    if (allowanceWei == null) {
      const msg = "Cannot ensure the allowance";
      console.error(msg, {
        nft_contract_address,
        currency_address,
        allowanceWei,
      });
      // message.error(msg, 6);
      return 0;
    }

    return allowanceWei;
  }, [AuthStore.token, boxPrice, isSupportedConnectedChain]);

  useEffect(() => {
    if (!AuthStore.isLoggedIn) {
      // only check allowance if user connected the wallet and logged-in
      return;
    }
    if (!boxPrice) {
      return;
    }
    const currency_symbol = boxPrice?.currency.symbol as GQL_Currency;

    // Call with debounce
    _callFnDebounced(async () => {
      console.log(
        "{UseBuyBox} <== re-fetch allowance for currency: ",
        currency_symbol
      );

      switch (currency_symbol) {
        case GQL_Currency.BUSD:
        case GQL_Currency.USDT:
          ApprovalStore.setState({
            busd_allowance: await checkAllowanceForBoxPrice(),
          });
          console.log(
            "{UseBuyBox} ==> re-fetch allowance result: ",
            currency_symbol,
            ApprovalStore.busd_allowance
          );
          break;
        case GQL_Currency.undefined:
          break;
        default:
          throw new Error(
            "{UseBuyBox} re-fetch allowance does handle currency: " +
              currency_symbol
          );
      }
    });
  }, [
    AuthStore.token,
    boxPrice?.currency.symbol,
    boxPrice,
    checkAllowanceForBoxPrice,
  ]);

  const requireWhitelist =
    round?.is_whitelist === false && round?.require_whitelist === true;

  const isSaleRound = useMemo(() => {
    if (round == null || round.is_whitelist == null) {
      return false;
    }
    //@ts-ignore
    return !round.is_whitelist && !round.require_presale;
  }, [round]);

  const isSaleRoundWithFee = useMemo(() => {
    if (round == null) {
      return false;
    }
    //@ts-ignore
    return round.require_presale;
  }, [round]);

  let buyBtnDisabledReason: BuyDisabledReason | undefined = useMemo(() => {
    if (!isSaleRound) {
      return BuyDisabledReason.NotSaleRound;
    } else if (boxType.sold_amount >= boxType.total_amount) {
      return BuyDisabledReason.SoldOut;
    } else if (!(requireWhitelist ? isInWhitelist : true)) {
      return BuyDisabledReason.WhitelistNotRegistered;
    }
    return;
  }, [isSaleRound, boxType, isInWhitelist, requireWhitelist]);
  // const buyFormEnabled = isSaleRound
  //   && boxType.total_amount > boxType.sold_amount
  //   && (requireWhitelist ? isInWhitelist : true)
  // ;

  // if (!connectedChainNetwork) {
  /**
   * If wallet was not connect => Allow click buy but show modal to connect wallet
   */
  // buyFormEnabled = false
  // buyBtnDisabledReason = BuyDisabledReason.WalletNotConnected
  // } else

  // can buy box: in buy round + enough box to buy + registered whitelist if need + box left
  const buyFormEnabled = useMemo(() => {
    if (!isSaleRound) {
      return false;
    } else if (boxType.sold_amount >= boxType.total_amount) {
      return false;
    } else if (!(requireWhitelist ? isInWhitelist : true)) {
      return false;
    }
    return true;
  }, [isSaleRound, boxType, isInWhitelist, requireWhitelist]);

  // can buy box: in buy round + enough box to buy + registered whitelist if need + box left
  const buyFormWithFeeEnabled = useMemo(() => {
    if (!isSaleRoundWithFee) {
      return false;
    } else if (boxType.sold_amount >= boxType.total_amount) {
      return false;
    }
    return true;
  }, [isSaleRound, boxType, isInWhitelist, requireWhitelist]);

  const onBuyBoxError = (e: GraphQLError) => {
    // show message and handle
    console.log("{onBuyBoxError} e: ", e);
    const { message: msg } = e;
    if (msg === "Allowance not enough") {
      message.error(msg, 6);
      // TODO: call approval again
      alert("connect metamask to get approval");
    } else {
      message.error(msg, 6);
      // AppEmitter.emit('showConnectWalletModal')
    }
  };

  const onAuthError = (e: GraphQLError) => {
    // show connect wallet modal and message
    console.log("{onAuthError} e: ", e);
    message.error(
      "Error: Unauthorized: Please connect and verify your wallet first!",
      6
    );
    AppEmitter.emit("showConnectWalletModal");
  };

  const doBuyBox = async function () {
    if (!AuthStore.isLoggedIn) {
      message.error("Failed - You've not complete the verification!");
      return;
    }

    if (!boxPrice) {
      setErr("Box price not found!");
      return;
    }

    if (!isSupportedConnectedChain) {
      setErr("Current chain not supported");
    }

    if (!round) {
      setErr("Round not found!");
      return;
    }
    if (round.require_whitelist === true && !isInWhitelist) {
      message.error("This box is for whitelisted user only", 3);
      return;
    }

    const quantity = parseFloat(txtAmount.value ?? "0");
    if (!txtAmount.value || quantity <= 0) {
      txtAmount.setErr("Amount must be greater than 0");
      return;
    }

    const maxPerUser = boxType.limit_per_user ?? 100; // default is 100 per user
    if (quantity > maxPerUser) {
      txtAmount.setErr(`An user can buy up to ${maxPerUser} boxes only`);
      return;
    }

    // console.log("round: ", round);
    setErr(undefined);

    console.log("==> {onBuyBox} input: ", {
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
    return buyBox(
      boxPrice?.uid,
      round?.id ?? 0,
      quantity,
      coupon?.is_used == false ? txtCoupon.value : undefined
    )
      .then((res) => {
        console.log("{onBuyBox.res} res: ", res);
        const success = res.data.buyBox;
        if (success) {
          // message.success(
          //   // '<span>Successfully buy the box (TODO: INFO) | tx hash: (TODO: txhash)</span>',
          //   "Success!",
          //   5
          // );
          txtAmount.setValue("");
          CampaignStore.connectModalVisible = true;
        } else {
          message.error("Buy box failed");
        }
      })
      .catch((err) => {
        onApolloError(
          err,
          onBuyBoxError,
          onAuthError,
          (e: Error | ServerParseError | ServerError) => {
            console.error("{onBuyBox.onNetworkError} e: ", e);
          }
        );
      })
      .finally(() => {
        setLoading(false);
        setCoupon(undefined);
        txtCoupon.onChange("");
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

  const hasEnoughAllowanceForBoxPrice = async () => {
    return (await checkAllowanceForBoxPrice()) >= ETHER_MIN_ALLOWANCE;
  };

  const requestAllowanceForBoxPrice = async () => {
    setLoading(true);
    if (!AuthStore.isLoggedIn) {
      message.warn("Please connect wallet and verify your address first!");
      setLoading(false);
      return false;
    }

    if (!ConnectWalletStore_NonReactiveData.web3Provider) {
      message.error(
        "[Critical] This is unexpected behavior occur in our app, please reconnect your wallet to ensure the app run correctly",
        6
      );
      setLoading(false);
      return false;
    }

    const nft_contract_address = boxPrice?.contract_address ?? "";
    const currency_address = boxPrice?.currency.address ?? ""; // address of token to buy
    const ethersService = new EthersService(
      ConnectWalletStore_NonReactiveData.web3Provider
    );

    // Request approval
    try {
      const success = await ethersService.requestApproval(
        nft_contract_address,
        currency_address
      );

      if (success) {
        ApprovalStore.setCurrencyEnabled(
          (boxPrice?.currency.symbol as GQL_Currency) ?? false
        );
      }
      setLoading(false);
      return success;
    } catch (error: any) {
      if (error.code === Web3ProviderErrorCodes.provider.userRejectedRequest) {
        message.error("User denied", 5);
        setLoading(false);
      }
    }
  };

  async function buyBox(
    box_price_uid: string,
    round_id: number,
    quantity: number,
    coupon_code?: string
  ): Promise<any> {
    const res = await apoloClient.mutate({
      mutation: gql`
        mutation buyBox($input: BuyBoxInput!) {
          buyBox(input: $input)
        }
      `,
      variables: {
        input: { box_price_uid, round_id, quantity },
        coupon_code,
      },
    });

    return res;
  }

  async function checkCoupon(code: string): Promise<any> {
    setCoupon(undefined);
    setCouponError(undefined);

    if (!code) {
      return true;
    }

    if (!AuthStore.isLoggedIn) {
      message.error("Failed - You've not complete the verification!");
      return;
    }

    try {
      const res = await apoloClient.query({
        query: CHECK_COUPON_QUERY,
        variables: {
          code: `${code}`,
        },
        fetchPolicy: "network-only",
      });
      let _coupon = res.data.getCoupon as Coupon;
      if (!_coupon) {
        return false;
      }
      if (_coupon.is_used) {
        setCouponError("Invalid coupon");
        return false;
      }
      setCoupon(res.data.getCoupon);
      return true;
    } catch (err: any) {
      setCouponError(extractError(err));
      return false;
    }
  }

  return {
    loading,
    isSaleRound,
    isSaleRoundWithFee,
    buyFormEnabled,
    buyFormWithFeeEnabled,
    buyBtnDisabledReason,
    err,
    txtAmount,
    txtCoupon,
    requireWhitelist,
    boxPrice,

    doBuyBox,
    hasEnoughAllowanceForBoxPrice,
    requestAllowanceForBoxPrice,
    currencyEnabled,
    isSupportedConnectedChain,
    checkCoupon,
    coupon,
    couponError,
  };
}

const BUY_BOX_MUT = gql`
  mutation buyBox($input: BuyBoxInput!) {
    buyBox(input: $input)
  }
`;

const CHECK_COUPON_QUERY = gql`
  query getCoupon($code: String!) {
    getCoupon(code: $code) {
      discount
      max_value_off
      currency_uid
      is_used
    }
  }
`;

async function getCoupon(code: string) {
  const res = await apoloClient.query({
    query: CHECK_COUPON_QUERY,
    variables: {
      code,
    },
    fetchPolicy: "network-only",
  });
  return res;
}
