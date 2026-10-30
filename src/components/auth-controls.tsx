"use client";

import { UserButton } from "@clerk/nextjs";
import styles from "./chats/chats.module.css";

export function AuthControls() {
  return <div className={styles.accountControls} aria-label="Account">
    <UserButton showName appearance={{ elements: { rootBox: { width: "100%" }, userButtonTrigger: { width: "100%", justifyContent: "space-between", flexDirection: "row-reverse", padding: "4px 8px", boxShadow: "none" }, userButtonOuterIdentifier: { fontFamily: "inherit", fontSize: "13px" } } }} />
  </div>;
}
