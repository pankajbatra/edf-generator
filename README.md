# EDF Generator for Software and Service Exporters

From 1 October 2026, Indian exporters of software and services must give their bank an
Export Declaration Form (EDF). The rule comes from the Foreign Exchange Management
(Export and Import of Goods and Services) Regulations, 2026 (FEMA 23(R)/2026-RB).

This tool fills that form for you from a simple web form.

## Privacy

- It is a static page. There is no server, no login, no analytics.
- A Content Security Policy blocks every network call (`connect-src 'none'`).
- Your data stays in your browser tab.
- To reuse it next month, click **Export JSON** and keep the file.
- Optional: tick "keep a draft in this browser" to use localStorage. It is off by default.

## What it does

- Fills the EDF in the Annex format (Parts 1, 2A, 2B, 3, 4 and 5).
- Covers many invoices and clients in one EDF. The rules allow one EDF per month.
- Works out the INR value and writes it in words (lakh and crore).
- Strikes out the options that do not apply in the declaration:
  I/We, goods/services, buyer/third party, have delivered/will deliver, foreign exchange/INR.
- Checks your data: IEC, PAN and GSTIN format, the 30 day deadline, invoices outside
  the month, short receipts, missing rates and SAC codes.
- Outputs:
  - **Download Word (.docx)** to edit or print.
  - **Print / Save as PDF** from the browser.
  - **Copy disposal email**, a draft of the instruction email for your bank.

## Monthly workflow

1. Open the tool. Click **Import JSON** and pick last month's file.
2. Click **Start next month**. Your profile, bank and clients stay. Invoice numbers,
   dates and amounts are cleared.
3. Enter this month's invoices and exchange rates. Use the rate from your GST invoice / GSTR-1.
4. Fix anything shown in red under **Checks**.
5. Download the Word file or print to PDF. Sign it and stamp it.
6. Click **Export JSON** and keep the file for next month.

Deadline: within 30 days from the end of the month in which the invoice was raised.

## Host it on GitHub Pages

1. Create a repository and upload all files in this folder (keep the `vendor` folder).
2. Go to **Settings > Pages**.
3. Under "Build and deployment", pick **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Your tool will be live at `https://<your-username>.github.io/<repo-name>/`.

You can also just open `index.html` from your computer. It works offline.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page and form |
| `app.js` | All logic: form state, checks, form preview, Word export, email |
| `styles.css` | Styles, including print layout |
| `vendor/docx-8.5.0.umd.js` | [docx](https://github.com/dolanmiu/docx) library (MIT), bundled so no CDN is needed |
| `samples/sample-edf.json` | Fictional sample you can import |

## Notes and limits

- Bank formats differ a little. Some banks want Part 2A filled even for services.
  There is a switch for that.
- Shipping bill, port and LEO date are "Not applicable" for services.
- Invoices dated before 1 October 2026 generally fall under the old 2015 rules.
  The tool warns you about these.
- This is not legal or tax advice. Check every field before you sign.

## License

MIT. See `LICENSE`.
