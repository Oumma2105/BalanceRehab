\# Database Schema



\## patients



\- id

\- patient\_code

\- full\_name

\- age

\- sex

\- height\_cm

\- weight\_kg

\- pathology

\- clinical\_notes

\- created\_at

\- updated\_at



\## sessions



\- id

\- patient\_id

\- test\_type

&#x20; - static

&#x20; - dynamic

\- support\_ring

&#x20; - installed

&#x20; - removed

\- visual\_condition

&#x20; - eyes\_open

&#x20; - eyes\_closed

\- duration\_seconds

\- total\_balance\_score

\- board\_stability\_score

\- posture\_stability\_score

\- mean\_sway\_ap

\- mean\_sway\_ml

\- max\_sway\_ap

\- max\_sway\_ml

\- sway\_velocity

\- instability\_events

\- trunk\_deviation

\- shoulder\_asymmetry

\- hip\_asymmetry

\- interpretation

\- created\_at



\## sensor\_samples



\- id

\- session\_id

\- timestamp\_ms

\- front\_left

\- front\_right

\- rear\_left

\- rear\_right

\- anterior\_posterior\_sway

\- medial\_lateral\_sway

\- stability\_score



\## posture\_samples



\- id

\- session\_id

\- timestamp\_ms

\- trunk\_inclination

\- shoulder\_asymmetry

\- hip\_asymmetry

\- body\_center\_deviation

\- posture\_score



\## reports



\- id

\- session\_id

\- report\_file\_path

\- language

&#x20; - en

&#x20; - fr

\- generated\_at



\## recommendations



\- id

\- session\_id

\- category

\- recommendation\_en

\- recommendation\_fr

\- priority

&#x20; - low

&#x20; - medium

&#x20; - high

