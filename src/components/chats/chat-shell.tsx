"use client";

import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { PanelLeft } from "lucide-react";
import { ChatSidebar } from "./chat-sidebar";
import styles from "./chats.module.css";

export function ChatShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  function closeDrawer() { drawer.current?.close(); setDrawerOpen(false); opener.current?.focus(); }
  return <div className={styles.workspace} data-collapsed={collapsed}>
    <div className={styles.desktopSidebar} hidden={collapsed}><ChatSidebar onClose={() => setCollapsed(true)} /></div>
    <main id="chat-content" className={styles.main}>
      <header className={styles.workspaceHeader}>
        <button ref={opener} className={`${styles.iconButton} ${styles.mobileMenu}`} aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={drawerOpen}
          onClick={() => { setDrawerOpen(true); drawer.current?.showModal(); }}><PanelLeft size={17} aria-hidden="true" /></button>
        {collapsed ? <button className={`${styles.iconButton} ${styles.desktopMenu}`} aria-label="Open sidebar" onClick={() => setCollapsed(false)}><PanelLeft size={17} aria-hidden="true" /></button> : null}
        <span className={styles.modelLabel}><Image src="/brand/mark.svg" width={13} height={13} alt="" />OpenRouter Free</span>
      </header>
      <div className={styles.mainContent}>{children}</div>
    </main>
    <dialog ref={drawer} className={styles.navigationDrawer} aria-label="Navigation" onCancel={event => { event.preventDefault(); closeDrawer(); }} onClose={() => setDrawerOpen(false)}>
      {drawerOpen ? <ChatSidebar onClose={closeDrawer} onNavigate={closeDrawer} /> : null}
    </dialog>
  </div>;
}
