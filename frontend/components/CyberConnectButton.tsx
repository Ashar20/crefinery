'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function CyberConnectButton() {
  return (
    <div className="cyber-connect-wrapper">
      <ConnectButton.Custom>
        {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
          const connected = mounted && account && chain;
          return (
            <button
              onClick={connected ? openAccountModal : openConnectModal}
              className="cyber-connect-btn"
              type="button"
            >
              {connected ? `${account.displayName}` : 'CONNECT WALLET'}
            </button>
          );
        }}
      </ConnectButton.Custom>
    </div>
  );
}
