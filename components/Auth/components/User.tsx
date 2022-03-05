import { useCallback, useState } from "react";
import { observer } from 'mobx-react-lite'
import { Button, Col, Modal, Row, Popover } from "antd";
import { useRouter } from "next/router";

import ConnectWalletStore, { nonReactive as ConnectWalletStore_NonReactiveData } from "../ConnectWalletStore";
import AuthStore from "../AuthStore";
import AuthBoxStore from "./AuthBoxStore";

import AuthService from "../AuthService";
import { getAppNetworkFriendlyName } from "utils/blockchain/ChainConfig";
import { ChainNetwork, ChainNetworkAvatar, getChainNetworkFromChainId } from "utils/blockchain/BlockChain";
import { trim_middle } from "utils/String";

import s from "./User.module.sass";
import { AppEmitter } from "../../../services/emitter";


type Props = {};
export default  observer(function User(props: Props) {
  const router = useRouter()

  const {
    address,
    network: connected_network
  } = ConnectWalletStore;

  const {
    name,
  } = AuthStore;

  const changeWallet = () => {
    AuthBoxStore.connectModalVisible = true;
  };


  const disconnectWallet = useCallback(async () => {
    const authService = new AuthService();
    authService.logout();

    AppEmitter.emit('onWalletDisconnect')
  }, [])




  let chainNetIcoUrl = '';
  if (connected_network) {
    const n: ChainNetwork | undefined = getChainNetworkFromChainId(connected_network.chainId);
    if (n) {
      chainNetIcoUrl = ChainNetworkAvatar[n];
    }
  }
  // console.log('{User} chainNetIcoUrl: ', chainNetIcoUrl);


  const profileModal = (
    <Row className={s.profileModal}>
      <Col span={8} className={s.avatarC}>
        <div className={`${s.avatar} ${s.avBig}`}>
          <img src="/assets/MyProfile/defaultAvatar.png" alt="" />
        </div>
        <p>{name}</p>
      </Col>
      <Col span={16} style={{borderLeft: '1px solid #fff', paddingLeft: 20}}>
        <p className={s.addr}>{trim_middle(address ?? '', 10, 8)}</p>
        <p className={s.chainBtn}>
          <img src={chainNetIcoUrl} alt="" />
          {getAppNetworkFriendlyName(connected_network)}
        </p>

        <div className={s.btns}>
          <Button type="link" onClick={() => router.push('/profile')}>My Profile</Button>
          <Button type="link" onClick={disconnectWallet}>Disconnect</Button>
        </div>
      </Col>
    </Row>
  )

  return (
    <div className={s.container}>
      <Button onClick={changeWallet} className={s.chainBtn}>
        <img src={chainNetIcoUrl} alt="" />
        {getAppNetworkFriendlyName(connected_network)}
      </Button>

      <Popover
        placement="bottomRight"
        content={profileModal}
        // trigger="hover"
        trigger="click"
      >
        <div className={s.avatar} style={{marginLeft: 20}}>
          <img src="/assets/MyProfile/defaultAvatar.png" alt="" />
        </div>
      </Popover>
    </div>
  )
})
