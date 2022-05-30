import {
  Form,
  InputNumber,
  message,
  Popconfirm,
  Progress,
  Tooltip,
} from "antd";
import AuthStore from "components/Auth/AuthStore";
import { observer } from "mobx-react";
import timeMoment from "moment-timezone";
import React, { useEffect, useRef, useState } from "react";
import { GBoxCampaignRound, WhitelistStatus } from "src/generated/graphql";
import "swiper/css";
import "swiper/css/pagination";
import { Swiper, SwiperSlide } from "swiper/react";
import { useMutationRegisterWhiteList } from "../../../../hooks/campaign/useRegisterWhiteList";
import ConnectWalletBtn from "../../../Auth/components/ConnectWalletBtn";
import s from "./SiteMap.module.sass";
import ConnectWalletStore, {
  nonReactive as ConnectWalletStore_NonReactiveData,
} from "components/Auth/ConnectWalletStore";
import { Web3ProviderErrorCodes } from "components/Auth/ConnectWalletHelper";
import EthersService from "services/blockchain/Ethers";
import BigNumber from "bignumber.js";
import { useForm } from "antd/lib/form/Form";
import { isEmpty } from "lodash";
import { usePresaleRemaining } from "hooks/campaign/useDetailCampaign";

interface IRound {
  rounds: GBoxCampaignRound[];
  start: any;
  end: any;
  setTimeCountDown: (value: number) => void;
  setTextNow: (value: string) => void;
  boxCampaignUid: string;
  tzid: string;
  widthScreen: number;
  isInWhitelist: boolean;
  whitelistRegistered: WhitelistStatus;
  whitelistRegisteredRecently: WhitelistStatus;
  refetch: any;
  token: string | undefined;
  presale?: any;
}

export default observer(function SiteMap(props: IRound) {
  const {
    rounds,
    start,
    setTimeCountDown,
    end,
    setTextNow,
    boxCampaignUid,
    tzid,
    widthScreen,
    isInWhitelist,
    whitelistRegistered,
    whitelistRegisteredRecently,
    refetch,
    token,
    presale,
  } = props;

  const { dataPresaleRemaining, refetchPresaleRemaining } = usePresaleRemaining(
    {
      box_campaign_uid: boxCampaignUid,
      skip: isEmpty(boxCampaignUid),
    }
  );

  const [listRounds, setListRounds] = useState([] as any);
  const [isActiveUpComing, setIsActiveUpComing] = useState(false);
  const { registerWhitelist, error, loading, data } =
    useMutationRegisterWhiteList();
  const [keyActiveSlide, setKeyActiveSlide] = useState(0);
  const [amountBox, setAmountBox] = useState(0);
  const isWhitelisted = isInWhitelist || data?.registerWhitelist;
  const [disabledButton, setDisabledButton] = useState(false);

  // --- Detect amount field type wrong
  const [form] = useForm();

  const getCurrentRound = () => {
    const dateNow = timeMoment().tz(tzid).unix();
    const upcomingStart = timeMoment(start).tz(tzid).unix();
    const closeEnd = timeMoment(end).tz(tzid).unix();
    const firstStart = timeMoment(rounds[0]?.start).tz(tzid).unix();
    // console.log(firstStart);
    // const firstStart = 0; // TODO: Fix bug above line
    const time = (firstStart - dateNow) * 1000;
    setIsActiveUpComing(false);

    if (upcomingStart <= dateNow && dateNow <= firstStart) {
      setTextNow(`${rounds[0]?.name} will start in`);
      setIsActiveUpComing(true);
      setKeyActiveSlide(0);
      setTimeout(() => {
        getCurrentRound();
      }, time);
      setTimeCountDown(Math.floor(time / 1000));
    }

    const lastStart = timeMoment(rounds[rounds?.length - 1]?.start)
      .tz(tzid)
      .unix();
    const timeLast = (closeEnd - dateNow) * 1000;

    if (lastStart <= dateNow && dateNow <= closeEnd) {
      setTextNow("The campaign will end in");
      setTimeout(() => {
        getCurrentRound();
      }, timeLast);
      setTimeCountDown(Math.floor(timeLast / 1000));
    }

    if (dateNow > closeEnd) {
      setKeyActiveSlide(rounds.length + 1);
      setTextNow("");
    }

    const x = rounds?.map((e, index) => {
      const endDate = timeMoment(e.end).tz(tzid).unix();
      const startDate = timeMoment(e.start).tz(tzid).unix();
      const timeEnd = (endDate - dateNow) * 1000;
      if (startDate <= dateNow && dateNow <= endDate) {
        if (rounds[rounds.length - 1]?.id !== e?.id) {
          setTextNow(`${e?.name} will end in`);
          setTimeout(() => {
            getCurrentRound();
          }, timeEnd);
          setTimeCountDown(Math.floor(timeEnd / 1000));
        }
        if (widthScreen >= 639) setKeyActiveSlide(index);
        else setKeyActiveSlide(index + 1);
        return { ...e, isActive: true };
      } else {
        return { ...e, isActive: false };
      }
    });
    setListRounds(x);
  };

  const handleApplyWhiteList = async () => {
    await registerWhitelist({
      variables: {
        box_campaign_uid: boxCampaignUid,
      },
    });
  };

  const contract_address = "0x776161E47a91561b3D1B8e8Dc34BFea57B019a60";
  const currency_address = "0x4bE02BFe61a7ABDd31F8fE5e51a03ABd7028d450"; // address of token to buy BUSD

  const handleApplyWhiteListWithFee = async () => {
    if (!AuthStore.isLoggedIn) {
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

    const ethersService = new EthersService(
      ConnectWalletStore_NonReactiveData.web3Provider
    );

    const getMyAllowance = await ethersService.getMyAllowanceOf(
      contract_address,
      currency_address
    );

    let bool = false;
    let value = 0;

    if (rounds[0]?.presale_price) {
      value = amountBox * rounds[0]?.presale_price;
    }

    const amount = new BigNumber(Number(amountBox))
      .multipliedBy(Math.pow(10, 18))
      .toFormat({ groupSeparator: "" });

    if (getMyAllowance && getMyAllowance < Number(amount)) {
      bool = await ethersService.requestApproval(
        contract_address,
        currency_address
      );
    } else {
      bool = true;
    }

    if (bool) {
      const result = await ethersService.transferFT(
        contract_address,
        currency_address,
        value
      );

      if (!result.error) {
        presale({
          variables: {
            box_campaign_uid: boxCampaignUid,
            quantity: amountBox,
            tx_hash: result.txHash,
            address: ConnectWalletStore.address,
          },
          onCompleted: () => {
            refetchPresaleRemaining();
            message.success("Successfully");
          },
          onError: (e: any) => {
            console.error(e);
            message.success("Error. Please try again");
          },
        });
      } else {
        //@ts-ignore
        message.error(result?.error?.message);
      }
    }
  };

  useEffect(() => {
    getCurrentRound();
  }, [start, end, rounds]);

  const swiperRef = useRef(null);

  useEffect(() => {
    // @ts-ignore
    swiperRef.current?.swiper.slideTo(keyActiveSlide);
    // console.log("keyActiveSlide", keyActiveSlide);
  }, [keyActiveSlide]);

  useEffect(() => {
    refetch();
  }, [token]);

  const whitelistDataSource =
    whitelistRegisteredRecently ?? whitelistRegistered;
  const whitelist_total_registered = whitelistDataSource?.registered ?? 0;
  const whitelist_total_limit = whitelistDataSource?.limit ?? 0;
  const whitelistHaSlotLeft =
    whitelist_total_registered < whitelist_total_limit;
  const disableClickWhitelist = isWhitelisted || !whitelistHaSlotLeft;

  const handleFormChange = () => {
    const hasErrors = form.getFieldsError().some(({ errors }) => errors.length);
    // console.log(hasErrors);

    setDisabledButton(hasErrors);
  };

  return (
    <div className={`flex justify-center relative ${s.SiteMapContainer}`}>
      {/* <div className={`${s.SiteMapLineTimeLine} w-10/12`}></div> */}
      <div className={`w-11/12`}>
        <Swiper
          // @ts-ignore
          ref={swiperRef}
          hashNavigation={{
            watchState: true,
          }}
          breakpoints={{
            360: {
              slidesPerView: 2,
            },
            639: {
              slidesPerView: 3,
            },
            1200: {
              slidesPerView: 4,
            },
            1300: {
              slidesPerView: 5,
            },
          }}
        >
          <SwiperSlide data-hash="slide-1">
            <div
              className={`flex flex-col justify-center select-none px-2 ${s.SiteMapLineCircleTitleBox}`}
            >
              <div className={`${s.hSlide} flex flex-col justify-end w-full`}>
                <p
                  className={`text-white font-bold m-0 ${
                    s.SiteMapLineCircleTitle
                  } ${isActiveUpComing ? s.active : ""}`}
                >
                  Upcoming
                </p>

                <p
                  className={`text-white pb-2 mb-10 ${
                    s.SiteMapLineCircleTime
                  } ${isActiveUpComing ? s.active : ""}`}
                >
                  {timeMoment(start).tz(tzid).format("HH:mm, MMMM DD")}
                </p>
              </div>

              <div style={{ width: "100%" }}>
                <div
                  className={`${s.SiteMapLineCircle} ${
                    isActiveUpComing ? s.active : ""
                  }`}
                />
                <div className={s.line} />
              </div>

              <div
                className={`text-white mt-10 w-full ${s.SiteMapLineCircleContent}`}
              >
                Stay tuned and prepare.
              </div>
            </div>
          </SwiperSlide>
          {listRounds?.map((item: any, key: number) => (
            <SwiperSlide key={key} data-hash={`slide-${key + 2}`}>
              <div
                className={`flex flex-col justify-center select-none px-2 ${s.SiteMapLineCircleTitleBox}`}
              >
                <div className={`${s.hSlide} flex flex-col justify-end w-full`}>
                  <div
                    className={`text-white font-bold ${
                      s.SiteMapLineCircleTitle
                    } ${item.isActive === true ? s.active : ""}`}
                  >
                    {item.name}
                  </div>
                  <div
                    className={`text-white pb-2 mb-10 ${
                      s.SiteMapLineCircleTime
                    } ${item.isActive === true ? s.active : ""}`}
                  >
                    {timeMoment(new Date(item.start))
                      .tz(tzid)
                      .format("HH:mm, MMMM DD")}
                  </div>
                </div>

                <div style={{ width: "100%" }}>
                  <div
                    className={`${s.SiteMapLineCircle} ${
                      item.isActive === true ? s.active : ""
                    }`}
                  />
                  <div className={s.line}></div>
                </div>

                <div
                  className={`text-white mt-10 w-full ${s.SiteMapLineCircleContent}`}
                >
                  {item.description}
                </div>

                {item.is_whitelist && item.isActive && (
                  <>
                    {AuthStore.isLoggedIn ? (
                      <div className="max-w-[250.91px]">
                        {!disableClickWhitelist ? (
                          <div>
                            {/* REGISTER WHITELIST free */}
                            <Popconfirm
                              placement="top"
                              title={"You're going to be whitelisted"}
                              onConfirm={handleApplyWhiteList}
                              okText="Yes"
                              cancelText="No"
                            >
                              <button
                                className={`
                                    ${s.button} 
                                    ${
                                      !whitelistHaSlotLeft ? s.disabledBtn : ""
                                    } 
                                    ${isWhitelisted ? s.whitelisted : ""} 
                                    font-bold text-white text-center uppercase
                                  `}
                                style={{ fontWeight: "600" }}
                              >
                                APPLY WHITELIST
                              </button>
                            </Popconfirm>

                            {/* REGISTER WHITELIST with fee */}
                            {/* <button
                              className={`
                                    ${s.button} 
                                    ${
                                      !whitelistHaSlotLeft ? s.disabledBtn : ""
                                    } 
                                    ${isWhitelisted ? s.whitelisted : ""} 
                                    font-bold text-white text-center uppercase
                                  `}
                              style={{ fontWeight: "600" }}
                              onClick={handleApplyWhiteListWithFee}
                            >
                              APPLY WHITELIST
                            </button> */}
                          </div>
                        ) : (
                          <Tooltip
                            placement="top"
                            title={
                              isWhitelisted
                                ? `You've already in the whitelist`
                                : !whitelistHaSlotLeft
                                ? `No whitelist slot left, you cannot register anymore`
                                : ""
                            }
                          >
                            <button
                              disabled={disableClickWhitelist}
                              className={`
                                  ${s.button} 
                                  ${!whitelistHaSlotLeft ? s.disabledBtn : ""} 
                                  ${isWhitelisted ? s.whitelisted : ""} 
                                  font-bold text-white text-center uppercase
                                `}
                            >
                              {isWhitelisted ? (
                                <>
                                  <img
                                    src="/assets/UpComing/tick-done-2.svg"
                                    alt=""
                                    style={{
                                      width: 24,
                                      padding: "0 0 3px 0",
                                      fontWeight: "600",
                                    }}
                                  />
                                  WHITELISTED
                                </>
                              ) : !whitelistHaSlotLeft ? (
                                `NO SLOT LEFT`
                              ) : (
                                ""
                              )}
                            </button>
                          </Tooltip>
                        )}

                        <Progress
                          strokeColor="#0BEBD6"
                          percent={
                            whitelist_total_limit
                              ? (whitelist_total_registered /
                                  whitelist_total_limit) *
                                100
                              : 0
                          }
                          showInfo={false}
                        />
                        <p className="text-right text-white mt-1">{`${whitelist_total_registered} / ${whitelist_total_limit}`}</p>
                      </div>
                    ) : (
                      <div className={`mt-3 ${s.btnConnect}`}>
                        <ConnectWalletBtn small={widthScreen <= 1024} />
                      </div>
                    )}
                  </>
                )}

                {item.presale_price && (
                  <>
                    {AuthStore.isLoggedIn ? (
                      <div className="max-w-[250.91px]">
                        <div className={`${s.amount} font-bold`}>
                          <label className={s.label}>
                            <span className="text-[18px] md:text-[24px=">
                              Amount:{" "}
                            </span>
                            <br />
                          </label>
                          <Form
                            className={s.buyForm}
                            form={form}
                            onFieldsChange={handleFormChange}
                          >
                            <Form.Item
                              name="amount"
                              rules={[
                                {
                                  required: true,
                                  message: "Please input amount!",
                                },

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
                                  max: dataPresaleRemaining?.remain,
                                  message: `Amount must be less than ${dataPresaleRemaining?.remain}`,
                                },
                              ]}
                              className={s.inputRow}
                            >
                              <InputNumber
                                style={{ background: "none" }}
                                value={amountBox}
                                onChange={(value: number) => {
                                  setAmountBox(value);
                                }}
                                controls={false}
                              />
                            </Form.Item>
                          </Form>
                        </div>

                        <div>
                          {/* REGISTER WHITELIST with fee */}
                          <Popconfirm
                            placement="top"
                            title={"You're going to be whitelisted"}
                            onConfirm={handleApplyWhiteListWithFee}
                            okText="Yes"
                            cancelText="No"
                            disabled={
                              disabledButton ||
                              dataPresaleRemaining?.presaled >
                                dataPresaleRemaining?.remain
                            }
                          >
                            <button
                              className={`
                                    ${s.button}  
                                    ${disabledButton ? s.disabledBtn : ""}
                                    ${
                                      dataPresaleRemaining?.presaled >
                                      dataPresaleRemaining?.remain
                                        ? s.disabledBtn
                                        : ""
                                    }
                                    font-bold text-white text-center uppercase
                                  `}
                              style={{ fontWeight: "600" }}
                            >
                              APPLY WHITELIST
                            </button>
                          </Popconfirm>
                        </div>

                        <Progress
                          strokeColor="#0BEBD6"
                          percent={
                            dataPresaleRemaining?.presaled
                              ? (dataPresaleRemaining?.presaled /
                                  (dataPresaleRemaining?.remain +
                                    dataPresaleRemaining?.presaled)) *
                                100
                              : 0
                          }
                          showInfo={false}
                        />
                        <p className="text-right text-white mt-1">{`${
                          dataPresaleRemaining?.presaled
                        } / ${
                          dataPresaleRemaining?.remain +
                          dataPresaleRemaining?.presaled
                        }`}</p>
                      </div>
                    ) : (
                      <div className={`mt-3 ${s.btnConnect}`}>
                        <ConnectWalletBtn small={widthScreen <= 1024} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </SwiperSlide>
          ))}

          <SwiperSlide data-hash={`slide-${listRounds.length + 2}`}>
            <div
              className={`flex flex-col justify-center select-none px-2 ${s.SiteMapLineCircleTitleBox}`}
            >
              <div className={`${s.hSlide} flex flex-col justify-end w-full`}>
                <div
                  className={`text-white font-bold ${
                    s.SiteMapLineCircleTitle
                  } ${
                    timeMoment().tz(tzid).unix() >=
                    timeMoment(end).tz(tzid).unix()
                      ? s.active
                      : ""
                  }`}
                >
                  Closed
                </div>

                <div
                  className={`text-white pb-2 mb-10 ${
                    s.SiteMapLineCircleTime
                  } ${
                    timeMoment().tz(tzid).unix() >=
                    timeMoment(end).tz(tzid).unix()
                      ? s.active
                      : ""
                  }`}
                >
                  {timeMoment(end).tz(tzid).format("HH:mm, MMMM DD")}
                </div>
              </div>
              <div
                className={`${s.SiteMapLineCircle} ${
                  timeMoment().tz(tzid).unix() >=
                  timeMoment(end).tz(tzid).unix()
                    ? s.active
                    : ""
                }`}
              ></div>
              <div
                className={`text-white mt-10 w-full ${s.SiteMapLineCircleContent}`}
              >
                Thank you for watching.
              </div>
            </div>
          </SwiperSlide>
        </Swiper>
      </div>
    </div>
  );
});

// export default SiteMap;
