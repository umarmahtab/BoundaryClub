# Boundary Club V5

Run a cricket auction with two to eight custom franchises. Start with 238 players and ₹100 crore per team, or bring your own player pool and set the rules for your league.

**[Open the auction room](https://boundaryclubgame.vercel.app)** · [Download v5](https://github.com/umarmahtab/BoundaryClub/archive/refs/heads/v5.zip) · [Browse the v4 archive](https://github.com/umarmahtab/BoundaryClub/tree/v4)

![Boundary Club v5 setup with the engraved stadium, auction settings and four editable franchise cards](assets/screenshots/v5/auction-room.jpg)

## Run your first auction

1. **Set up the franchises.** Pick a team count, then edit each team name and colour on the opening screen. Select **Change logo** to use one of six club crests or upload a PNG, JPG or WebP.
2. **Choose the rules.** Set the purse, squad size, overseas limit and retention slots. Choose a bid clock and decide whether a new bid restarts it, keeps it running, or leaves at least ten seconds.
3. **Choose how to play.** Pick **Solo vs computer** and choose your franchise, or select **Control all teams** for a shared-screen auction. Create a **Multiplayer Room** to have players claim separate franchises on their own devices.
4. **Open the floor.** Start the auction, complete any retentions, and open a player pool. Bid with the team cards or number keys. For a jump bid, select **2×** or **5×** before choosing a team.
5. **Close the books.** Give unsold players another round or finish the auction to see the final squads. Download a PDF scorecard or export the figures as CSV.

## On the bidding floor

The Knights lead at **₹2.10 crore** in the example below. Each eligible team can see its next offer and how much purse it would have left after winning. Open **Bid history** to review the sequence or **Teams** to check squad composition before the next bid.

![Live bidding for Virat Kohli with the Knights holding the highest bid and four franchise purse balances visible](assets/screenshots/v5/bidding-floor.jpg)

<details>
<summary><strong>Franchise crest editor</strong></summary>

Choose a crest or upload an image up to 4 MB. The saved logo follows the franchise onto the bidding floor and final scorecard.

![Franchise logo editor showing six crest choices and the image upload control](assets/screenshots/v5/franchise-crests.jpg)

</details>

<details>
<summary><strong>Mobile setup and session resume</strong></summary>

Return in the same browser and choose **Resume** to pick up a saved auction.

<img src="assets/screenshots/v5/mobile-setup.jpg" width="320" alt="Mobile auction setup with the franchise cards and the option to resume a previous session">

</details>

## Bring your own players

Open **Player pool → Import PDF** before starting the auction. Use a Boundary Club roster PDF or a selectable-text table with the four columns below. The preview shows accepted and rejected rows before you add players or replace the database.

| Player | Role | Country | Base (lakhs) |
| --- | --- | --- | ---: |
| Example Player | Spinner | India | 50 |

Choose **Roster PDF** for a working example you can re-import. For an image-only scan, run OCR first. **Reports** also offers CSV and PDF auction reports and JSON session backups.

## Run locally

[Download the v5 ZIP](https://github.com/umarmahtab/BoundaryClub/archive/refs/heads/v5.zip), extract it, and open `index.html` in a modern browser. Keep `assets/` and `sounds/` beside it. The app and its PDF tools run locally without a build step.

<details>
<summary><strong>Auctioneer keyboard controls</strong></summary>

| Key | Action |
| --- | --- |
| `1` – `8` | Bid for the corresponding franchise when you control it |
| `Space` | Pause or resume the clock |
| `S` / `N` | Sell the current player / open the next lot |
| `R` / `U` | Restart the current lot / undo the last recorded action |
| `M` / `?` | Toggle sound / show keyboard help |

</details>

---

Built by [Umar Mahtab](https://github.com/umarmahtab). The current release lives on [main](https://github.com/umarmahtab/BoundaryClub/tree/main) and [v5](https://github.com/umarmahtab/BoundaryClub/tree/v5). Earlier editions are available in the [v4 branch](https://github.com/umarmahtab/BoundaryClub/tree/v4) and the [v3 repository](https://github.com/umarmahtab/Cricket-Auction-Simulator-V3).
