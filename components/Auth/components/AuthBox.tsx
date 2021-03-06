import { observer } from "mobx-react"; // Or "mobx-react".

import ConnectWalletBtn from "./ConnectWalletBtn";
import User from "./User";
import AuthStore from "../AuthStore";
import ConnectWalletModal from "./ConnectWalletModal";

type Props = {
  small?: boolean;
};
export default observer(function AuthBox(props: Props) {
  return (
    <>
      {AuthStore.isLoggedIn ? (
        <User />
      ) : (
        <ConnectWalletBtn small={props.small} />
      )}

      <ConnectWalletModal />
    </>
  );
});
