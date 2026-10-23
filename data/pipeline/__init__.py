"""Base Recruits registry pipeline: official federal sources -> reviewed snapshot.

Only public U.S. Department of Education data is acquired here, through the
download and API endpoints the Department publishes for that purpose:

* EADA (Equity in Athletics Data Analysis) — which institutions reported a
  men's baseball team, its participant count, and the institution's athletics
  classification, for one academic year.
* College Scorecard — institution facts, admissions (from IPEDS) and published
  prices, each labelled with the term or academic year it describes.

The output is a snapshot file. Nothing here writes to a database: an
administrator stages a snapshot in the app, reviews the changes, and publishes.
"""
