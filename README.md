# Position Manager

Position Manager is a lightweight browser extension that adds a draggable risk-management panel to [TradingView](https://www.tradingview.com/). It calculates a position size from your account equity, risk tolerance, entry price, stop-loss price, and leverage, then lets you apply the calculated quantity to TradingView's order ticket.

The extension is designed to make position sizing deliberate and consistent before a trade is placed.

## Features

- Calculates position quantity from a fixed percentage of account equity
- Automatically determines long or short direction from the entry and stop-loss prices
- Shows stop-loss distance, nominal position size, required margin, and projected stop-loss amount
- Reads the current symbol, market price, account equity, limit or stop entry price, and stop-loss price from TradingView when available
- Applies the calculated quantity to TradingView's quantity field
- Records signed realized profit/loss and trade direction for the current day in browser local storage
- Enforces a configurable maximum daily drawdown
- Disables position application when:
  - the daily loss limit has been reached, or
  - the required margin exceeds account equity
- Provides a draggable, minimizable interface isolated from TradingView's styles

## Position-sizing model

The extension uses the following calculations:

```text
Risk amount       = Account equity × Risk percentage
Stop distance     = |Entry price − Stop-loss price| ÷ Entry price
Nominal size      = Risk amount ÷ Stop distance
Position quantity = Nominal size ÷ Entry price
Required margin   = Nominal size ÷ Leverage
```

For example, with $10,000 of equity, 1% risk, an entry at $100, and a stop loss at $98:

```text
Risk amount       = $100
Stop distance     = 2%
Nominal size      = $5,000
Position quantity = 50 units
```

Leverage changes the required margin, but it does not change the amount at risk at the stop-loss price.

## Installation

This repository currently contains an unpacked browser extension and is not distributed through a browser extension store.

### Chrome, Brave, or another Chromium browser

1. Clone or download this repository.
2. Open `chrome://extensions` in your browser.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the repository directory containing `manifest.json`.
6. Open or refresh TradingView.

### Firefox

1. Clone or download this repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on**.
4. Choose `manifest.json` from the repository.
5. Open or refresh TradingView.

Firefox removes temporary extensions when the browser closes, so you must load it again in a new browser session.

## Usage

1. Open a TradingView chart and its order ticket.
2. Confirm or enter your account equity and leverage.
3. Set your desired risk percentage and maximum daily drawdown.
4. Enter an entry price and stop-loss price. When supported by the current TradingView order ticket, the extension fills these values automatically.
5. Review the calculated position quantity, nominal size, required margin, and projected stop-loss amount.
6. Select **Apply Position** to copy the calculated quantity into TradingView's quantity field.

The extension does not submit an order. Review every value in TradingView before placing the trade.

## ATR stop loss

Add one ATR indicator to the active TradingView chart and keep its legend value visible. ATR mode enables automatically when the order ticket opens or its symbol/direction changes. Select **1x**, **1.5x**, or **2x** (default: 1x). The current ATR appears above the buttons.

- Direction comes from the active Buy/Sell control in TradingView's order ticket. Buy subtracts ATR distance from entry; Sell adds it. No calculation is made when direction cannot be detected.
- Choosing an ATR option fills the order ticket's stop-loss price and enables its stop-loss switch if needed. Changing entry or the page's Buy/Sell direction also recalculates and fills the stop while ATR mode is enabled.
- Live ATR changes update the displayed ATR without moving the stop. Click the selected multiplier again to apply the latest displayed value.
- Editing the stop manually in either the panel or the order ticket unchecks ATR mode. Panel edits are copied to the ticket; ticket edits update the panel and position sizing.
- **Stop Loss Distance** appears in the summary as percentage and absolute price distance.
- Leverage is read automatically from the order ticket's leverage button when available; manual entry remains available when detection fails.
- The reader uses the displayed legend value, which can follow the crosshair over historical candles. Move the pointer off historical candles before applying ATR.
- Missing or ambiguous ATR data clears a requested calculation while waiting for a valid value. Multiple charts require a detectable active chart, and multiple ATR studies are unsupported.
- Stop-loss writing expects the ticket field to be in absolute-price mode, as shown by its price value. Review the ticket's field mode and resulting value.
- **Apply Position** copies position quantity. ATR controls fill the stop-loss field, but the extension never submits an order.

## Daily Profit

Enter positive amounts for profits and negative amounts for losses, and select Long or Short for each record. The direction defaults to the detected ticket direction at the start of a new setup and can be changed independently for logging a completed trade.

The total is net realized profit: negative totals use red (#F23645); zero or positive totals use green (#31BD65). Each record shows its signed amount, symbol, direction (when recorded), and time. Existing loss-only records migrate as negative amounts; their unknown historical direction is left unspecified.

Records persist locally and reset on the next polling cycle after the local calendar date changes. Individual entries can be removed or all records cleared.

The existing maximum daily-loss limit still counts the sum of losing entries. Profitable entries change the displayed net profit but do not offset losses for this limit.

ATR auto-enable detects the visible ticket opening/reopening or a change of symbol/direction. It does not detect a submitted trade that leaves the same ticket continuously open. Manual stop edits keep ATR off within the same setup.

## Privacy

Position Manager has no backend and sends no account or trading data to an external service. Daily-loss records are stored in the browser's local storage for TradingView.

The extension runs only on URLs matching:

```text
https://*.tradingview.com/*
```

## Current limitations

- TradingView can change its page structure without notice. Automatic field detection or quantity application may stop working when element IDs or selectors change.
- Quantity is currently rounded to two decimal places, which may not suit every instrument.
- Daily losses must be entered manually.
- The extension does not account for fees, slippage, funding, liquidation price, contract multipliers, or instrument-specific quantity rules.
- Account-equity detection depends on the relevant value being visible in TradingView.
- Firefox installation is temporary unless the extension is packaged and signed.

## Project structure

```text
.
├── manifest.json   # Manifest V3 extension configuration
├── content.js      # Panel UI, TradingView integration, and risk calculations
├── livermore.jpg   # Image displayed in the panel
└── LICENSE         # MIT License
```

## Development

There is no build step or package dependency. Edit `content.js`, reload the unpacked extension from your browser's extension page, and refresh TradingView to test changes.

Run the dependency-free ATR unit tests with `node --test tests/atr.test.cjs` and check syntax with `node --check content.js`. These tests use DOM fixtures, not a live TradingView page.

## Disclaimer

This software is provided for informational and risk-management purposes only. It is not financial advice and does not guarantee that losses will remain within the selected risk amount. Market gaps, slippage, fees, leverage, liquidation, execution behavior, and incorrect or stale page data can produce different results. You are responsible for verifying all calculations and orders before trading.

## License

Licensed under the [MIT License](LICENSE).
