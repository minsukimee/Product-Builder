# Whale Wars – 5-Minute Leverage Arena

A simple, meme-style virtual cryptocurrency leverage trading game that runs entirely in the browser. Test your degen instincts in a 5-minute, high-octane arena where prices are wild and fortunes can be made or lost in an instant.

## Game Rules

-   **5-Minute Rounds**: Each game round lasts exactly 5 minutes (300 seconds). A new round automatically begins after the previous one ends.
-   **Random Price Action**: The price chart is generated randomly for each round. However, the price is clamped and will **never** move more than ±50% from its starting price of 100.
-   **Up to 10x Leverage**: Choose your leverage from 1x to 10x. Higher leverage amplifies both your potential profits and losses. Leverage can only be changed when you have no open position.
-   **Persistent Account**: Your starting account balance is $10,000. This balance persists across rounds. Your goal is to grow it as much as possible.
-   **Bankruptcy & Ad Rescue**: If your account balance drops to zero, you are bankrupt! You can respawn by "watching an ad" (clicking a button), which will grant you $2,000 to get back in the game. This feature has a cooldown and a daily usage limit.

## How to Deploy

This project consists of static HTML, CSS, and JavaScript files and requires no build step. It can be deployed on any modern static hosting platform.

### Deploying with Cloudflare Pages

1.  Push this repository to your own GitHub account.
2.  Log in to your Cloudflare dashboard and go to **Workers & Pages**.
3.  Select **Create application** > **Pages** > **Connect to Git**.
4.  Select your repository.
5.  In the "Build settings", you can leave the **Build command** field empty and set the **Build output directory** to `/` (or leave it as the default if it works).
6.  Click **Save and Deploy**.

## Seed Replayability

Each round is generated using a unique "seed" which is displayed in the top bar. While the current version does not support replaying a specific seed, the seed is provided to make this feature possible in the future. You can copy the seed for your records.
