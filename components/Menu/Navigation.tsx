import * as React from "react";
import { motion } from "framer-motion";
import { MenuItem, MenuItemType } from "./MenuItem";
import GradientButton from "../Button/GradientButton";
import { useEffect, useState } from "react";

import { Modal, Button } from "antd";
import { AppEmitter } from "../../services/emitter";

const variants = {
  open: {
    transition: { staggerChildren: 0.07, delayChildren: 0.2 },
  },
  closed: {
    transition: { staggerChildren: 0.05, staggerDirection: -1 },
  },
};
export const Navigation = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const handleOk = () => {
    setIsModalVisible(false);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const menuItems: MenuItemType[] = [
    {
      color: "#FF008C",
      text: "Homepage",
      scrollTarget: "#Homepage",
      statusMenu: false,
    },
    {
      color: "#FF008C",
      text: "Investors",
      scrollTarget: "#Investors",
      statusMenu: true,
    },
    {
      color: "#FF008C",
      statusMenu: false,
      text: (
        <GradientButton
          onClick={() => {
            setIsModalVisible(true);
          }}
          type={1}
          className="text-white font-saira text-20px leading-28px nw"
          style={{ whiteSpace: "nowrap" }}
        >
          Connect wallet 
        </GradientButton>
      ),
    },
  ];

  useEffect(() => {
    const subscription = AppEmitter.addListener('setJoinUsVisible', (visible: boolean) => {
      setIsModalVisible(visible)
    });
    return () => {
      subscription.remove();
    }
  }, [])

  return (
    <div>
      <motion.ul className="nav-list" variants={variants}>
        {menuItems.map((i, idx) => (
          <MenuItem item={i} key={idx} />
        ))}
      </motion.ul>
    </div>
  );
};
