Put the real bank logo files in this folder and the app uses them automatically
(on the Purchase Order form, the printed PO and the supplier list).

Name each file after the bank, lowercase, spaces become dashes. PNG, SVG, JPG or WEBP:

  bdo.png   bpi.png   metrobank.png   gotyme.png   landbank.png   pnb.png
  security-bank.png   unionbank.png   rcbc.png   china-bank.png   eastwest.png
  psbank.png   maybank.png   dbp.png   cimb.png   aub.png   boc.png
  robinsons-bank.png   sterling-bank.png   gcash.png   maya.png   seabank.png
  uniondigital.png   tonik.png   citibank.png   hsbc.png   standard-chartered.png

The dropdown lists only banks that have a logo here (BDO, BPI, Metrobank, GoTyme, Landbank, PNB, Security Bank,
China Bank, EastWest, GCash, Maya). To add a bank to the dropdown, add its logo file and its name to the BANKS list in docs.js.
A bank typed by hand that is not in the list shows a plain colored text badge. Wide logos on a transparent or white
background work best (about 200 x 60 px). Then commit and push, and Railway redeploys.
