import React, { useCallback, useMemo, useState } from "react";
import {
  Button,
  Form,
  Input,
  InputNumber,
  message,
  notification,
  Popconfirm,
  Progress,
  Tooltip,
} from "antd";
import s from "../Box/Box.module.sass";
import {
  GBoxType,
  GCurrency,
  GBoxPrice,
  GBoxCampaignRound,
  ChainSymbol,
  GChain,
  GBoxCampaignBuyHistory,
} from "src/generated/graphql";
import { useInput } from "hooks/common/use_input";
import { BuyDisabledReason, useBuyBox } from "hooks/campaign/use_buy_box";
import { handleApolloError } from "utils/apollo_client";
import { observer } from "mobx-react-lite";
import ConnectWalletStore from "../../../Auth/ConnectWalletStore";
import {
  ChainNetwork,
  ChainNetworkAvatar,
  symbol2Network,
} from "../../../../utils/blockchain/BlockChain";
import { correctBoxShadow } from "framer-motion/types/projection";
import { currency } from "../../../../utils/Number";
import { AppEmitter } from "../../../../services/emitter";
import AuthStore from "../../../Auth/AuthStore";
import ApprovalStore from "../../../Auth/Blockchain/ApprovalStore";
import ModalConfirm from "./ModalConfirm";
import { useForm } from "antd/lib/form/Form";
import ModalShare from "../Modal";
import { useRouter } from "next/router";
import { ShareAltOutlined } from "@ant-design/icons";
import CampaignStore from "../../../../src/store/CampaignStore";
import PopupPurchasedSuccess from "../popup/popupSuccess";

type Props = {
  boxType: GBoxType;
  chains: GChain[];
  round?: GBoxCampaignRound;
  isInWhitelist?: boolean;
  purchasedBox?: GBoxType;
  // recentlyPurchasedBox?: GBoxCampaignBuyHistory;
};

type ChainProps = {
  url: string;
  symbol: ChainSymbol;
};

const BoxTypeCard = observer((props: Props) => {
  const { boxType, round, isInWhitelist, chains } = props;

  const purchasedBox =
    props.purchasedBox?.uid == boxType.uid ? props.purchasedBox : undefined;
  const { chainNetwork } = ConnectWalletStore;
  // const { isLoggedIn } = AuthStore;

  // TODO: Fetch refetch whitelist info after logged in status
  // change from false to true
  // use Mobx autorun

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [disabledButton, setDisabledButton] = useState(false);
  const [isModalShareVisible, setIsModalShareVisible] = useState(false);
  const isModalPopupSuccessVisible = CampaignStore.connectModalVisible;

  // --- Detect amount field type wrong
  const [form] = useForm();

  const {
    loading,
    txtAmount,
    isSaleRound,
    isSaleRoundWithFee,
    buyFormEnabled,
    buyFormWithFeeEnabled,
    buyBtnDisabledReason,
    err,
    requireWhitelist,
    boxPrice,
    txtCoupon,
    doBuyBox,
    requestAllowanceForBoxPrice,
    currencyEnabled,
    isSupportedConnectedChain,
    checkCoupon,
    coupon,
    couponError,
  } = useBuyBox(
    boxType,
    round,
    isInWhitelist,
    chainNetwork,
    // isLoggedIn,
    purchasedBox
  );

  const handleFormChange = () => {
    const hasErrors = form.getFieldsError().some(({ errors }) => errors.length);
    // console.log(hasErrors);

    setDisabledButton(hasErrors);
  };

  const handleOk = () => {
    doBuyBox();
    setIsModalVisible(false);
    // txtAmount.onChange("");
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const handleFinish = async () => {
    if (txtAmount.value !== "") {
      if (!isSupportedConnectedChain) {
        message.warn(
          "Current chain not supported, please connect other wallet on supported chain!",
          15
        );
        return;
      }
      if (!(await checkCoupon(txtCoupon.value))) {
        return;
      }
      setIsModalVisible(true);
    }
  };

  const supported_chains_avatars: ChainProps[] =
    boxType.prices?.map((i) => ({
      url: ChainNetworkAvatar[
        symbol2Network(i.currency.chain_symbol) ?? "undefined"
      ],
      symbol: i.currency.chain_symbol,
    })) ?? [];

  const buyFormDisabledMsg: Record<BuyDisabledReason, string> = {
    [BuyDisabledReason.WalletNotConnected]:
      "you need to connect wallet in order to buy boxes",
    [BuyDisabledReason.SoldOut]: "Sold out",
    [BuyDisabledReason.WhitelistNotRegistered]:
      "This box is for whitelisted user only",
    [BuyDisabledReason.NotSaleRound]: "Please wait the campaign open",
  };

  const showConnectWalletModal = useCallback(() => {
    AppEmitter.emit("showConnectWalletModal");
  }, []);

  const modalConfirmProps = {
    handleOk,
    handleCancel,
    isModalVisible,
    boxName: boxType.name,
    chainIcon: supported_chains_avatars,
    amount: txtAmount.value,
    coupon: coupon,
    price: boxPrice?.price,
    symbol: boxPrice?.currency.symbol,
    boxImg: boxType.thumb_img,
    chains: chains,
  };

  const closeModalShare = () => {
    setIsModalShareVisible(false);
  };

  return (
    <div>
      <div className="flex justify-center">
        <h3
          className="uppercase text-center text-white font-bold text-[24px] lg:text-[36px]"
          style={{ whiteSpace: "nowrap" }}
        >
          {boxType.name}
        </h3>
      </div>

      <div className={`mt-5 ${s.boxDetail}`}>
        <div className={`${s.bgImage}`}>
          <img
            src={boxType.thumb_img ?? ""}
            width="340px"
            height="273px"
            className="mx-auto"
            alt=""
          />
          {/* <div
            className={`${s.bgImageBtn}`}
            onClick={() => {
              setIsModalShareVisible(true);
            }}
          >
            <img src="/assets/Box/btn_share.svg" alt=""/>
          </div> */}
        </div>

        <div className={`mx-auto ${s.boxMain}`}>
          {boxType.desc && (
            <div className="flex gap-3 py-[15px]">
              <div>
                <div className={s.boxDes} />
              </div>
              <p
                className="text-white text-14px md:text-[16px]"
                style={{ whiteSpace: "pre-wrap" }}
              >
                {boxType.desc}
              </p>
            </div>
          )}

          {/*
          box.series_content must be html table in the database
          */}
          <div
            className={s.seriesContent}
            dangerouslySetInnerHTML={{ __html: boxType.series_content ?? "" }}
          />

          <div className="flex justify-between text-white font-bold text-[18px] md:text-[24px] mt-[10px]">
            <span>Chain</span>
            {/* <p className="m-0">{chains[0].symbol}</p> */}
            <div className={s.chainIcoC}>
              {supported_chains_avatars.map((i, idx) => (
                <img key={idx} src={i.url} alt="" title={i.symbol} />
              ))}
            </div>
          </div>

          {/*
          - Show buy form when sale open
          - Form was disabled if user have not meet buy condition
          */}
          {isSaleRound && (
            <Form
              className={s.buyForm}
              form={form}
              onFieldsChange={handleFormChange}
              onFinish={handleFinish}
            >
              <div className={`${s.amount} font-bold`}>
                <label className={s.label}>
                  <span className="text-[18px] md:text-[24px=">Amount: </span>
                  <br />
                  {boxType.limit_per_user != null && (
                    <span className={s.max}>Max: {boxType.limit_per_user}</span>
                  )}
                </label>
                <Form.Item
                  name="amount"
                  rules={[
                    { required: true, message: "Please input amount!" },

                    {
                      type: "number",
                      min: 1,
                      message: "Amount must be greater than 0",
                    },
                    {
                      type: "integer",
                      message: "Please enter an integer",
                    },
                    {
                      type: "number",
                      max: boxType.limit_per_user ?? boxType.total_amount,
                      message: `Amount must be less than ${
                        boxType.limit_per_user ?? boxType.total_amount
                      }`,
                    },
                  ]}
                  className={s.inputRow}
                >
                  <InputNumber
                    style={{ background: "none", width: "100%" }}
                    value={txtAmount.value}
                    onChange={txtAmount.onChange}
                    controls={false}
                  />
                </Form.Item>
              </div>

              {/* {!!txtAmount.err && (
                <span
                  style={{
                    color: "red",
                    fontSize: "13px",
                    marginBottom: "16px",
                  }}
                >
                  {txtAmount.err}
                </span>
              )} */}
              <div className={`${s.amount} font-bold`}>
                <label className={s.label}>
                  <span className="text-[18px] md:text-[24px=">Coupon: </span>
                </label>
                <Form.Item name="Coupon" className={s.inputText}>
                  <Input
                    style={{ background: "none", width: "100%" }}
                    value={txtCoupon.value}
                    onChange={txtCoupon.onChange}
                  />
                  {!!couponError && (
                    <span className={s.errorText}>{couponError}</span>
                  )}
                </Form.Item>
              </div>

              <div className="flex justify-between text-white items-center font-bold text-24px">
                {!buyFormEnabled ? (
                  // if btn is disable, show tooltip
                  <Tooltip
                    placement="top"
                    title={
                      buyBtnDisabledReason !== undefined
                        ? buyFormDisabledMsg[buyBtnDisabledReason]
                        : ""
                    }
                  >
                    <div>
                      <Button className={s.submit} disabled={true}>
                        BUY
                      </Button>
                    </div>
                  </Tooltip>
                ) : !AuthStore.isLoggedIn ? (
                  // if wallet was not connected => popconfirm
                  <Popconfirm
                    title={
                      <span>
                        You need to {chainNetwork ? "verify" : "connect"} wallet
                        <br /> in order to buy this box
                      </span>
                    }
                    onConfirm={showConnectWalletModal}
                    // onCancel={cancel}
                    okText={chainNetwork ? "Verify Wallet" : "Connect Wallet"}
                    cancelText="Close"
                  >
                    <div>
                      <Button className={s.submit} loading={loading}>
                        BUY
                      </Button>
                    </div>
                  </Popconfirm>
                ) : !isSupportedConnectedChain ? (
                  <Tooltip placement="top" title="Switch chain to buy">
                    <div>
                      <Button className={s.submit} disabled={true}>
                        BUY
                      </Button>
                    </div>
                  </Tooltip>
                ) : !currencyEnabled ? (
                  <Button
                    className={s.submitApproval}
                    onClick={requestAllowanceForBoxPrice}
                    loading={loading}
                  >
                    Enable {boxPrice?.currency.symbol}
                  </Button>
                ) : (
                  <Button
                    className={s.submit}
                    // onClick={handleOpen}
                    htmlType="submit"
                    loading={loading}
                    disabled={disabledButton}
                  >
                    BUY
                  </Button>
                )}

                {requireWhitelist && (
                  <span style={{ paddingLeft: 20, lineHeight: 1.3 }}>
                    Whitelist only
                  </span>
                )}
              </div>

              {/*{buyBtnDisabledReason === BuyDisabledReason.SoldOut &&*/}
              {/*<p style={{paddingLeft: 20, lineHeight: 1.3}}>Sold out</p>}*/}

              {!!err && (
                <span style={{ color: "red", fontSize: "13px" }}>{err}</span>
              )}
            </Form>
          )}

          {isSaleRoundWithFee && (
            <Form
              className={s.buyForm}
              form={form}
              onFieldsChange={handleFormChange}
              onFinish={handleFinish}
            >
              <div className={`${s.amount} font-bold`}>
                <label className={s.label}>
                  <span className="text-[18px] md:text-[24px=">Amount: </span>
                  <br />
                  {boxType.limit_per_user != null && (
                    <span className={s.max}>Max: {boxType.limit_per_user}</span>
                  )}
                </label>
                <Form.Item
                  name="amount"
                  rules={[
                    { required: true, message: "Please input amount!" },

                    {
                      type: "number",
                      min: 1,
                      message: "Amount must be greater than 0",
                    },
                    {
                      type: "integer",
                      message: "Please enter an integer",
                    },
                    {
                      type: "number",
                      max: boxType.limit_per_user ?? boxType.total_amount,
                      message: `Amount must be less than ${
                        boxType.limit_per_user ?? boxType.total_amount
                      }`,
                    },
                  ]}
                  className={s.inputRow}
                >
                  <InputNumber
                    style={{ background: "none" }}
                    value={txtAmount.value}
                    onChange={txtAmount.onChange}
                    controls={false}
                  />
                </Form.Item>
              </div>

              <div className={`${s.amount} font-bold`}>
                <label className={s.label}>
                  <span className="text-[18px] md:text-[24px=">Coupon: </span>
                </label>
                <Form.Item name="Coupon" className={s.inputText}>
                  <Input
                    style={{ background: "none" }}
                    value={txtCoupon.value}
                    onChange={txtCoupon.onChange}
                  />
                  {!!couponError && (
                    <span className={s.errorText}>{couponError}</span>
                  )}
                </Form.Item>
              </div>

              <div className="flex justify-between text-white items-center font-bold text-24px">
                {!buyFormWithFeeEnabled ? (
                  // if btn is disable, show tooltip
                  <Tooltip
                    placement="top"
                    title={
                      buyBtnDisabledReason !== undefined
                        ? buyFormDisabledMsg[buyBtnDisabledReason]
                        : ""
                    }
                  >
                    <div>
                      <Button className={s.submit} disabled={true}>
                        BUY
                      </Button>
                    </div>
                  </Tooltip>
                ) : !AuthStore.isLoggedIn ? (
                  // if wallet was not connected => popconfirm
                  <Popconfirm
                    title={
                      <span>
                        You need to {chainNetwork ? "verify" : "connect"} wallet
                        <br /> in order to buy this box
                      </span>
                    }
                    onConfirm={showConnectWalletModal}
                    // onCancel={cancel}
                    okText={chainNetwork ? "Verify Wallet" : "Connect Wallet"}
                    cancelText="Close"
                  >
                    <div>
                      <Button className={s.submit} loading={loading}>
                        BUY
                      </Button>
                    </div>
                  </Popconfirm>
                ) : !isSupportedConnectedChain ? (
                  <Tooltip placement="top" title="Switch chain to buy">
                    <div>
                      <Button className={s.submit} disabled={true}>
                        BUY
                      </Button>
                    </div>
                  </Tooltip>
                ) : !currencyEnabled ? (
                  <Button
                    className={s.submitApproval}
                    onClick={requestAllowanceForBoxPrice}
                    loading={loading}
                  >
                    Enable {boxPrice?.currency.symbol}
                  </Button>
                ) : (
                  <Button
                    className={s.submit}
                    //onClick={handleOpen}
                    htmlType="submit"
                    loading={loading}
                    //disabled={disabledButton}
                  >
                    BUY
                  </Button>
                )}

                {requireWhitelist && (
                  <span style={{ paddingLeft: 20, lineHeight: 1.3 }}>
                    Whitelist only
                  </span>
                )}
              </div>

              {/*{buyBtnDisabledReason === BuyDisabledReason.SoldOut &&*/}
              {/*<p style={{paddingLeft: 20, lineHeight: 1.3}}>Sold out</p>}*/}

              {!!err && (
                <span style={{ color: "red", fontSize: "13px" }}>{err}</span>
              )}
            </Form>
          )}

          <div className="font-bold text-white text-18px mt-[29px]">
            <div className="flex justify-between items-center">
              <span>Price per 1 box:</span>
              <div className="flex items-center justify-end gap-1">
                <img
                  src={
                    boxPrice?.currency.icon ??
                    "/assets/crypto/ico-question-mark.png"
                  }
                  width="36px"
                  height="36px"
                  alt=""
                />
                <span>
                  {currency(boxPrice?.price, 2)} {boxPrice?.currency.symbol}
                </span>
              </div>
            </div>
            <Progress
              percent={Math.floor(
                ((purchasedBox?.sold_amount ?? boxType.sold_amount) /
                  (purchasedBox?.total_amount ?? boxType.total_amount)) *
                  100
                // (boxType.sold_amount / boxType.total_amount) * 100
              )}
              showInfo={false}
              // status="active"
              strokeColor={"#0BEBD6"}
              // strokeColor={
              //   boxType.sold_amount < boxType.total_amount
              //     ? "#0BEBD6"
              //     : undefined
              // }
              strokeWidth={10}
            />
            <div className={s.flexRear}>
              <p>Sold</p>
              <p className="text-right">
                {`${purchasedBox?.sold_amount ?? boxType.sold_amount}/${
                  purchasedBox?.total_amount ?? boxType.total_amount
                }`}{" "}
                boxes
              </p>
            </div>
          </div>
        </div>
      </div>
      <ModalConfirm {...modalConfirmProps} />

      <ModalShare
        closeModalShare={closeModalShare}
        status={isModalShareVisible}
      />
      {isModalPopupSuccessVisible && (
        <PopupPurchasedSuccess></PopupPurchasedSuccess>
      )}
    </div>
  );
});

export default BoxTypeCard;
