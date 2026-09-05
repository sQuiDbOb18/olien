"use client";

import { explorerAddressUrl } from "@/lib/contracts";
import { AddressChip, Button, Dialog } from "./ui";

export function DepositDialog({ address, open, onClose }: { address: string; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Deposit">
      <p className="olien-dialog-text">Send USDC on Arc to this address. Gas comes out of the same balance.</p>
      <div className="olien-deposit-address">
        <AddressChip address={address} full />
      </div>
      <div className="olien-dialog-actions">
        <a className="olien-btn olien-btn--secondary" href={explorerAddressUrl(address)} target="_blank" rel="noreferrer">
          Open in ArcScan
        </a>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
