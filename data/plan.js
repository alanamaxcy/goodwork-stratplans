/* Engagement, plan and workplan content for one client portal.
   Taxonomy: Strategic Priority -> Initiative -> Task -> Subtask.
   A subtask is a task carrying a `parent`. KPIs hang off the priority.
   In the product this is the per-client record, served from Supabase; here it
   is illustrative content written against that client's real findings. */
window.PORTAL = {
 "client": {
  "name": "Resonate Church",
  "place": "Belvedere Park · Decatur, GA",
  "engagement": "Strategic Plan 2026–2028",
  "adopted": "2026-08-18"
 },
 "firm": {
  "name": "Good Work Atlanta",
  "lead": "Alan Maxcy"
 },
 "today": "2026-09-15",
 "phases": [
  {
   "id": "p1",
   "n": 1,
   "name": "Discovery",
   "start": "2026-02-02",
   "end": "2026-03-27",
   "status": "done",
   "blurb": "Listen widely enough that nobody can say the plan came from one room.",
   "deliverables": [
    "Congregational survey (96 responses)",
    "7 leader interviews",
    "Staff focus group",
    "Ministry partner focus group"
   ],
   "note": "105 sources of input. 92% of survey respondents answered at least one open-ended question."
  },
  {
   "id": "p2",
   "n": 2,
   "name": "Synthesis",
   "start": "2026-03-30",
   "end": "2026-05-08",
   "status": "done",
   "blurb": "Code every response, name the themes, count how many sources carry each one.",
   "deliverables": [
    "43 coded themes across SWOT",
    "Findings Explorer (this portal, §3)",
    "Elder findings session"
   ],
   "note": "Delivered as an interactive explorer rather than an appendix. Every theme carries its source count."
  },
  {
   "id": "p3",
   "n": 3,
   "name": "Plan design",
   "start": "2026-05-11",
   "end": "2026-07-10",
   "status": "done",
   "blurb": "Turn what we heard into four strategic priorities a board can hold in its head.",
   "deliverables": [
    "Two-day leadership retreat",
    "Priority and initiative drafting",
    "Measures workshop"
   ],
   "note": "Every initiative had to name the findings that produced it. Three drafts were cut for lack of evidence."
  },
  {
   "id": "p4",
   "n": 4,
   "name": "Adoption",
   "start": "2026-07-13",
   "end": "2026-08-21",
   "status": "done",
   "blurb": "Get it approved by the people who will be accountable for it.",
   "deliverables": [
    "Elder review draft",
    "Congregational presentation",
    "Board adoption vote"
   ],
   "note": "Adopted unanimously 18 Aug 2026."
  },
  {
   "id": "p5",
   "n": 5,
   "name": "Implementation",
   "start": "2026-08-24",
   "end": "2027-08-20",
   "status": "active",
   "blurb": "The plan becomes a workplan, and the workplan gets worked.",
   "deliverables": [
    "Quarterly progress reviews",
    "Owner coaching sessions",
    "Annual plan refresh"
   ],
   "note": "Quarterly review cadence. Next review 20 Nov 2026."
  }
 ],
 "scope": {
  "inScope": [
   "Congregation-wide and leadership discovery",
   "SWOT synthesis with source counts",
   "Three-year plan: strategic priorities, initiatives, KPIs",
   "Year-one workplan with named owners",
   "Quarterly implementation coaching through Aug 2027"
  ],
  "outOfScope": [
   "Lead pastor search execution — the committee owns this; the plan tracks its milestones only",
   "Capital campaign design (revisit after the building decision in §2, Initiative 3.3)",
   "Staff compensation study",
   "Facility architectural work"
  ],
  "cadence": [
   {
    "label": "Quarterly review",
    "detail": "Elders + staff leads + Good Work · 90 min",
    "next": "2026-11-20"
   },
   {
    "label": "Owner check-in",
    "detail": "Per-owner coaching · 30 min · monthly",
    "next": "2026-10-06"
   },
   {
    "label": "Annual refresh",
    "detail": "Re-run the pulse survey, reset year-two targets",
    "next": "2027-06-15"
   }
  ],
  "team": [
   {
    "name": "Alan Maxcy",
    "role": "Engagement lead",
    "org": "Good Work Atlanta"
   },
   {
    "name": "R. Alvarez",
    "role": "Executive pastor",
    "org": "Resonate"
   },
   {
    "name": "Elder board",
    "role": "Plan owner",
    "org": "Resonate"
   },
   {
    "name": "Search committee",
    "role": "Pastor search (parallel track)",
    "org": "Resonate"
   }
  ]
 },
 "plan": {
  "vision": "A church whose community is strong enough to multiply, whose people are equipped to disciple, and whose life is genuinely bound to the neighborhood it sits in — governed well enough to survive a pastoral transition.",
  "framing": "Four strategic priorities, twelve initiatives, three years. Each initiative names the discovery findings that produced it; each priority carries the KPIs that will tell us whether it worked. The lead pastor search runs alongside as its own track.",
  "priorities": [
   {
    "id": "P1",
    "n": 1,
    "title": "Life Groups that multiply",
    "thesis": "Life Groups are the most-named strength in the study (101 of 105 sources) and the most-named weakness (49). The same structure that formed this church is now the structure limiting it. The work is not to fix what people love — it is to give it a path to multiply.",
    "evidence": [
     "s1",
     "w1",
     "o12",
     "s7"
    ],
    "kpis": [
     {
      "text": "Charter adopted by elders",
      "target": "Nov 2026",
      "now": "Draft in elder review",
      "init": "1.1"
     },
     {
      "text": "Life Group leaders trained on the charter",
      "target": "100% by Feb 2027",
      "now": "0 of 22",
      "init": "1.1"
     },
     {
      "text": "Groups with a named apprentice",
      "target": "18 of 22 by Aug 2027",
      "now": "5 of 22",
      "init": "1.2"
     },
     {
      "text": "Groups multiplied",
      "target": "4 groups into 8 by Aug 2027",
      "now": "0",
      "init": "1.2"
     },
     {
      "text": "Median days from first visit to group placement",
      "target": "Under 45 by Aug 2027",
      "now": "Not yet measured",
      "init": "1.3"
     },
     {
      "text": "Groups meeting outside Tue/Wed evening",
      "target": "6 by Aug 2027",
      "now": "2",
      "init": "1.3"
     }
    ],
    "initiatives": [
     {
      "id": "1.1",
      "title": "Define what a Life Group is for",
      "detail": "One page, adopted by the elders: purpose, minimum commitments, what a group owes its members and the church. Discovery found leaders running four different implicit models.",
      "evidence": [
       "w1",
       "s1"
      ]
     },
     {
      "id": "1.2",
      "title": "Build a multiplication path",
      "detail": "An apprentice role in every group, a named trigger for when a group divides, and a leader bench deep enough that multiplying does not cost the church a group.",
      "evidence": [
       "w1",
       "o12",
       "s3"
      ]
     },
     {
      "id": "1.3",
      "title": "Open the front door",
      "detail": "Discovery was blunt: groups are closed, geographically lopsided, and hard to enter if you work evenings or have young kids. Placement should not depend on knowing the right person.",
      "evidence": [
       "w1",
       "w11",
       "s1"
      ]
     }
    ]
   },
   {
    "id": "P2",
    "n": 2,
    "title": "A discipleship and leadership pipeline",
    "thesis": "Teaching is the second-strongest asset in the study (81 sources). The absence of formal discipleship is the second-largest weakness (36), and 19 sources named the application gap directly: people are taught well and then left to work out what to do about it alone. The gap is not content. It is a path.",
    "evidence": [
     "s2",
     "w2",
     "w7",
     "o3",
     "o6",
     "w5",
     "s3"
    ],
    "kpis": [
     {
      "text": "Pathway published and in use",
      "target": "Mar 2027",
      "now": "Outline drafted",
      "init": "2.1"
     },
     {
      "text": "Adults who can name their next step (pulse survey)",
      "target": "60% by Jun 2027",
      "now": "23% (Feb 2026 baseline)",
      "init": "2.1"
     },
     {
      "text": "Leadership cohort launched",
      "target": "Feb 2027",
      "now": "Recruiting",
      "init": "2.2"
     },
     {
      "text": "Cohort reflects congregation demographics",
      "target": "Within 10 pts by Aug 2027",
      "now": "n/a",
      "init": "2.2"
     },
     {
      "text": "Adults serving in a named role",
      "target": "55% by Aug 2027",
      "now": "38%",
      "init": "2.3"
     },
     {
      "text": "Roles with a written description and a named lead",
      "target": "All by May 2027",
      "now": "9 of 31",
      "init": "2.3"
     }
    ],
    "initiatives": [
     {
      "id": "2.1",
      "title": "Publish a discipleship pathway",
      "detail": "Named next steps a person can actually take, in order, from first visit to leading others. Written down, visible, and owned by someone.",
      "evidence": [
       "w2",
       "o3",
       "w7"
      ]
     },
     {
      "id": "2.2",
      "title": "Open the leadership pipeline",
      "detail": "Build a bench that looks like the congregation and the neighborhood — including women and people of color — with a stated path into teaching, group leadership, and eldership.",
      "evidence": [
       "o6",
       "w3",
       "w4"
      ]
     },
     {
      "id": "2.3",
      "title": "Rebuild \"everybody plays\"",
      "detail": "\"Everybody plays\" is still named as a strength (40 sources) and its decline as a weakness (20). Both are true: the culture is remembered, the practice has thinned. Rebuild the on-ramp.",
      "evidence": [
       "s3",
       "w5"
      ]
     }
    ]
   },
   {
    "id": "P3",
    "n": 3,
    "title": "A church of Belvedere Park",
    "thesis": "Deeper neighborhood engagement is the second-highest opportunity in the study (58 sources), and the local outreach work already underway is a named strength (32). But 8 sources named the honest tension: we say we want the neighborhood without being willing to change for it. And 34 named the gap between who is in the room and who lives around it.",
    "evidence": [
     "o2",
     "s6",
     "w12",
     "w3",
     "t3"
    ],
    "kpis": [
     {
      "text": "Anchor partnerships with signed agreements",
      "target": "3 by Aug 2027",
      "now": "1",
      "init": "3.1"
     },
     {
      "text": "Volunteer hours into anchor partnerships",
      "target": "1,200/yr by 2027",
      "now": "410",
      "init": "3.1"
     },
     {
      "text": "Teaching voices from outside the current staff",
      "target": "8 per year by 2027",
      "now": "2",
      "init": "3.2"
     },
     {
      "text": "Congregation vs. tract demographics gap",
      "target": "Narrow by 15 pts by 2028",
      "now": "Baseline set Feb 2026",
      "init": "3.2"
     },
     {
      "text": "Options study complete",
      "target": "Mar 2027",
      "now": "Not started",
      "init": "3.3"
     },
     {
      "text": "Board decision recorded",
      "target": "Jun 2027",
      "now": "Pending study",
      "init": "3.3"
     }
    ],
    "initiatives": [
     {
      "id": "3.1",
      "title": "Move from events to partnerships",
      "detail": "Fewer one-off service days, more committed relationships with organizations already doing the work — with written agreements, named liaisons, and a multi-year horizon.",
      "evidence": [
       "o2",
       "s6",
       "w12"
      ]
     },
     {
      "id": "3.2",
      "title": "Close the gap between who we are and who lives here",
      "detail": "Discovery named diversity gaps across ethnicity, age, family stage, and income. This initiative sets a measurable target rather than a statement of intent, and locates the work in hiring, teaching voices, and leadership.",
      "evidence": [
       "w3",
       "o6",
       "w12"
      ]
     },
     {
      "id": "3.3",
      "title": "Decide the building question",
      "detail": "Space limits came up 18 times, and Belvedere Plaza is changing around us (16 sources). Stay, expand, or share — decide it, on evidence, by mid-2027, so the rest of the plan can assume an answer.",
      "evidence": [
       "w8",
       "t3",
       "o2"
      ]
     }
    ]
   },
   {
    "id": "P4",
    "n": 4,
    "title": "Govern for the next decade",
    "thesis": "The elder pipeline is broken (20 sources), governance and systems are thin (14), and the church is entering a pastoral transition that 79 sources named its biggest opportunity and 16 named a real risk. Structure is what makes a transition survivable rather than decisive.",
    "evidence": [
     "w6",
     "o7",
     "w9",
     "o11",
     "t1",
     "w4",
     "t4"
    ],
    "kpis": [
     {
      "text": "Revised elder model adopted",
      "target": "Jan 2027",
      "now": "Proposal drafted",
      "init": "4.1"
     },
     {
      "text": "Qualified candidates in the pipeline",
      "target": "6 by Aug 2027",
      "now": "2",
      "init": "4.1"
     },
     {
      "text": "Operating reserve",
      "target": "4 months by Aug 2027",
      "now": "1.8 months",
      "init": "4.2"
     },
     {
      "text": "Giving concentration in top 10 households",
      "target": "Under 30% by 2028",
      "now": "41%",
      "init": "4.2"
     },
     {
      "text": "Position papers published",
      "target": "May 2027",
      "now": "Elder study underway",
      "init": "4.3"
     },
     {
      "text": "Disagreement covenant adopted",
      "target": "Feb 2027",
      "now": "Not started",
      "init": "4.3"
     }
    ],
    "initiatives": [
     {
      "id": "4.1",
      "title": "Redesign the elder model and pipeline",
      "detail": "A stated term structure, a written path to eldership, and a nominating process that runs on a calendar rather than on who happens to be available.",
      "evidence": [
       "w6",
       "o7",
       "o11"
      ]
     },
     {
      "id": "4.2",
      "title": "Build financial resilience",
      "detail": "Economic pressure on giving capacity was the single most-named threat (26 sources). Build the reserve and diversify before the transition, not during it.",
      "evidence": [
       "t1",
       "w9",
       "t5"
      ]
     },
     {
      "id": "4.3",
      "title": "Say where we stand",
      "detail": "23 sources described a \"fuzzy\" culture around disagreement and unclear positions on women in leadership and LGBTQ inclusion. The finding is not which position to hold — it is that ambiguity is itself costing trust. Write the positions down and write down how we disagree well.",
      "evidence": [
       "w4",
       "s5",
       "t2"
      ]
     }
    ]
   }
  ],
  "track": {
   "id": "TRK",
   "title": "Lead pastor search",
   "note": "Named by 79 of 105 sources as the top opportunity and by 16 as a top risk — the highest-consensus finding in the study. It runs as its own track on its own clock, owned by the search committee. The plan tracks its milestones; it does not run it.",
   "evidence": [
    "o1",
    "t4",
    "s10"
   ],
   "milestones": [
    {
     "label": "Committee seated",
     "date": "2026-09-08",
     "status": "done"
    },
    {
     "label": "Profile published",
     "date": "2026-10-30",
     "status": "doing"
    },
    {
     "label": "Candidate slate to elders",
     "date": "2027-02-26",
     "status": "next"
    },
    {
     "label": "Call extended",
     "date": "2027-05-28",
     "status": "next"
    }
   ]
  }
 },
 "tasks": [
  {
   "id": "T-101",
   "obj": "1.1",
   "title": "Interview 8 Life Group leaders on the implicit models in use",
   "owner": "R. Alvarez",
   "start": "2026-08-24",
   "due": "2026-09-11",
   "status": "done"
  },
  {
   "id": "T-102",
   "obj": "1.1",
   "title": "Draft the one-page Life Group charter",
   "owner": "R. Alvarez",
   "start": "2026-09-14",
   "due": "2026-10-02",
   "status": "doing"
  },
  {
   "id": "T-102.1",
   "parent": "T-102",
   "obj": "1.1",
   "title": "Purpose statement — one paragraph",
   "owner": "R. Alvarez",
   "start": "2026-09-14",
   "due": "2026-10-02",
   "status": "done"
  },
  {
   "id": "T-102.2",
   "parent": "T-102",
   "obj": "1.1",
   "title": "Minimum commitments (frequency, size, term)",
   "owner": "R. Alvarez",
   "start": "2026-09-14",
   "due": "2026-10-02",
   "status": "doing"
  },
  {
   "id": "T-102.3",
   "parent": "T-102",
   "obj": "1.1",
   "title": "What a group owes the church",
   "owner": "R. Alvarez",
   "start": "2026-09-14",
   "due": "2026-10-02",
   "status": "next"
  },
  {
   "id": "T-102.4",
   "parent": "T-102",
   "obj": "1.1",
   "title": "What the church owes a group",
   "owner": "R. Alvarez",
   "start": "2026-09-14",
   "due": "2026-10-02",
   "status": "next"
  },
  {
   "id": "T-102.5",
   "parent": "T-102",
   "obj": "1.1",
   "title": "Circulate to 4 leaders for reaction",
   "owner": "R. Alvarez",
   "start": "2026-09-14",
   "due": "2026-10-02",
   "status": "next"
  },
  {
   "id": "T-103",
   "obj": "1.1",
   "title": "Elder review and adoption of the charter",
   "owner": "Elder board",
   "start": "2026-10-05",
   "due": "2026-11-13",
   "status": "next",
   "dep": "T-102"
  },
  {
   "id": "T-103.1",
   "parent": "T-103",
   "obj": "1.1",
   "title": "Table at the October elder meeting",
   "owner": "Elder board",
   "start": "2026-10-05",
   "due": "2026-11-13",
   "status": "next"
  },
  {
   "id": "T-103.2",
   "parent": "T-103",
   "obj": "1.1",
   "title": "Collect written objections",
   "owner": "Elder board",
   "start": "2026-10-05",
   "due": "2026-11-13",
   "status": "next"
  },
  {
   "id": "T-103.3",
   "parent": "T-103",
   "obj": "1.1",
   "title": "Revise and re-table",
   "owner": "Elder board",
   "start": "2026-10-05",
   "due": "2026-11-13",
   "status": "next"
  },
  {
   "id": "T-103.4",
   "parent": "T-103",
   "obj": "1.1",
   "title": "Record the vote",
   "owner": "Elder board",
   "start": "2026-10-05",
   "due": "2026-11-13",
   "status": "next"
  },
  {
   "id": "T-104",
   "obj": "1.1",
   "title": "Run two charter training sessions for group leaders",
   "owner": "J. Tran",
   "start": "2026-11-16",
   "due": "2027-02-12",
   "status": "next",
   "dep": "T-103"
  },
  {
   "id": "T-105",
   "obj": "1.2",
   "title": "Define the apprentice role and its expectations",
   "owner": "J. Tran",
   "start": "2026-09-07",
   "due": "2026-09-25",
   "status": "doing"
  },
  {
   "id": "T-105.1",
   "parent": "T-105",
   "obj": "1.2",
   "title": "Write the role description",
   "owner": "J. Tran",
   "start": "2026-09-07",
   "due": "2026-09-25",
   "status": "done"
  },
  {
   "id": "T-105.2",
   "parent": "T-105",
   "obj": "1.2",
   "title": "Define the time commitment",
   "owner": "J. Tran",
   "start": "2026-09-07",
   "due": "2026-09-25",
   "status": "doing"
  },
  {
   "id": "T-105.3",
   "parent": "T-105",
   "obj": "1.2",
   "title": "Agree what an apprentice may lead alone",
   "owner": "J. Tran",
   "start": "2026-09-07",
   "due": "2026-09-25",
   "status": "next"
  },
  {
   "id": "T-106",
   "obj": "1.2",
   "title": "Name the multiplication trigger (size, tenure, leader readiness)",
   "owner": "R. Alvarez",
   "start": "2026-09-28",
   "due": "2026-10-23",
   "status": "next",
   "dep": "T-105"
  },
  {
   "id": "T-107",
   "obj": "1.2",
   "title": "Recruit apprentices in the 10 largest groups",
   "owner": "J. Tran",
   "start": "2026-10-26",
   "due": "2027-01-29",
   "status": "next",
   "dep": "T-105"
  },
  {
   "id": "T-108",
   "obj": "1.2",
   "title": "Pilot the first two group multiplications",
   "owner": "J. Tran",
   "start": "2027-02-01",
   "due": "2027-04-30",
   "status": "next",
   "dep": "T-107"
  },
  {
   "id": "T-109",
   "obj": "1.3",
   "title": "Instrument first-visit to group-placement timing",
   "owner": "K. Delaney",
   "start": "2026-09-01",
   "due": "2026-09-12",
   "status": "late"
  },
  {
   "id": "T-109.1",
   "parent": "T-109",
   "obj": "1.3",
   "title": "Pick the field to record first-visit date",
   "owner": "K. Delaney",
   "start": "2026-09-01",
   "due": "2026-09-12",
   "status": "next"
  },
  {
   "id": "T-109.2",
   "parent": "T-109",
   "obj": "1.3",
   "title": "Backfill the last 12 months",
   "owner": "K. Delaney",
   "start": "2026-09-01",
   "due": "2026-09-12",
   "status": "next"
  },
  {
   "id": "T-109.3",
   "parent": "T-109",
   "obj": "1.3",
   "title": "Build the placement-lag report",
   "owner": "K. Delaney",
   "start": "2026-09-01",
   "due": "2026-09-12",
   "status": "next"
  },
  {
   "id": "T-110",
   "obj": "1.3",
   "title": "Map current group geography against where attenders live",
   "owner": "K. Delaney",
   "start": "2026-09-21",
   "due": "2026-10-16",
   "status": "next"
  },
  {
   "id": "T-111",
   "obj": "1.3",
   "title": "Launch two daytime or weekend groups",
   "owner": "J. Tran",
   "start": "2027-01-04",
   "due": "2027-03-26",
   "status": "next",
   "dep": "T-110"
  },
  {
   "id": "T-112",
   "obj": "1.3",
   "title": "Publish an open-groups directory anyone can join from",
   "owner": "K. Delaney",
   "start": "2026-10-19",
   "due": "2026-12-11",
   "status": "next",
   "dep": "T-110"
  },
  {
   "id": "T-201",
   "obj": "2.1",
   "title": "Audit what discipleship content already exists",
   "owner": "M. Okonkwo",
   "start": "2026-08-24",
   "due": "2026-09-18",
   "status": "doing"
  },
  {
   "id": "T-201.1",
   "parent": "T-201",
   "obj": "2.1",
   "title": "Inventory Wednesday curriculum",
   "owner": "M. Okonkwo",
   "start": "2026-08-24",
   "due": "2026-09-18",
   "status": "done"
  },
  {
   "id": "T-201.2",
   "parent": "T-201",
   "obj": "2.1",
   "title": "Inventory membership class material",
   "owner": "M. Okonkwo",
   "start": "2026-08-24",
   "due": "2026-09-18",
   "status": "doing"
  },
  {
   "id": "T-201.3",
   "parent": "T-201",
   "obj": "2.1",
   "title": "Inventory Life Group studies",
   "owner": "M. Okonkwo",
   "start": "2026-08-24",
   "due": "2026-09-18",
   "status": "next"
  },
  {
   "id": "T-201.4",
   "parent": "T-201",
   "obj": "2.1",
   "title": "Flag gaps against the pathway outline",
   "owner": "M. Okonkwo",
   "start": "2026-08-24",
   "due": "2026-09-18",
   "status": "next"
  },
  {
   "id": "T-202",
   "obj": "2.1",
   "title": "Draft the pathway: first visit → member → disciple-maker",
   "owner": "M. Okonkwo",
   "start": "2026-09-21",
   "due": "2026-11-20",
   "status": "next",
   "dep": "T-201"
  },
  {
   "id": "T-203",
   "obj": "2.1",
   "title": "Test the draft pathway with 12 adults across life stages",
   "owner": "M. Okonkwo",
   "start": "2026-11-23",
   "due": "2027-01-15",
   "status": "next",
   "dep": "T-202"
  },
  {
   "id": "T-204",
   "obj": "2.1",
   "title": "Publish the pathway and train staff to point at it",
   "owner": "M. Okonkwo",
   "start": "2027-01-18",
   "due": "2027-03-19",
   "status": "next",
   "dep": "T-203"
  },
  {
   "id": "T-205",
   "obj": "2.2",
   "title": "Write the leadership cohort curriculum and selection criteria",
   "owner": "S. Ibrahim",
   "start": "2026-09-14",
   "due": "2026-11-06",
   "status": "doing"
  },
  {
   "id": "T-205.1",
   "parent": "T-205",
   "obj": "2.2",
   "title": "Draft selection criteria",
   "owner": "S. Ibrahim",
   "start": "2026-09-14",
   "due": "2026-11-06",
   "status": "done"
  },
  {
   "id": "T-205.2",
   "parent": "T-205",
   "obj": "2.2",
   "title": "Draft the eight-session outline",
   "owner": "S. Ibrahim",
   "start": "2026-09-14",
   "due": "2026-11-06",
   "status": "doing"
  },
  {
   "id": "T-205.3",
   "parent": "T-205",
   "obj": "2.2",
   "title": "Name the two facilitators",
   "owner": "S. Ibrahim",
   "start": "2026-09-14",
   "due": "2026-11-06",
   "status": "next"
  },
  {
   "id": "T-205.4",
   "parent": "T-205",
   "obj": "2.2",
   "title": "Set the meeting cadence",
   "owner": "S. Ibrahim",
   "start": "2026-09-14",
   "due": "2026-11-06",
   "status": "next"
  },
  {
   "id": "T-206",
   "obj": "2.2",
   "title": "Recruit the first cohort — 12 people, demographics tracked",
   "owner": "S. Ibrahim",
   "start": "2026-11-09",
   "due": "2027-01-29",
   "status": "next",
   "dep": "T-205"
  },
  {
   "id": "T-207",
   "obj": "2.2",
   "title": "Launch cohort one",
   "owner": "S. Ibrahim",
   "start": "2027-02-01",
   "due": "2027-02-26",
   "status": "next",
   "dep": "T-206"
  },
  {
   "id": "T-208",
   "obj": "2.2",
   "title": "Add three new teaching voices to the Sunday rotation",
   "owner": "Elder board",
   "start": "2026-10-01",
   "due": "2027-05-28",
   "status": "next"
  },
  {
   "id": "T-209",
   "obj": "2.3",
   "title": "Inventory every volunteer role and who leads it",
   "owner": "P. Whitfield",
   "start": "2026-09-07",
   "due": "2026-10-09",
   "status": "doing"
  },
  {
   "id": "T-209.1",
   "parent": "T-209",
   "obj": "2.3",
   "title": "List every role from the Sunday run sheet",
   "owner": "P. Whitfield",
   "start": "2026-09-07",
   "due": "2026-10-09",
   "status": "done"
  },
  {
   "id": "T-209.2",
   "parent": "T-209",
   "obj": "2.3",
   "title": "List every role from kids and youth",
   "owner": "P. Whitfield",
   "start": "2026-09-07",
   "due": "2026-10-09",
   "status": "doing"
  },
  {
   "id": "T-209.3",
   "parent": "T-209",
   "obj": "2.3",
   "title": "Identify roles with no named lead",
   "owner": "P. Whitfield",
   "start": "2026-09-07",
   "due": "2026-10-09",
   "status": "next"
  },
  {
   "id": "T-210",
   "obj": "2.3",
   "title": "Write role descriptions for the 22 roles that have none",
   "owner": "P. Whitfield",
   "start": "2026-10-12",
   "due": "2027-05-14",
   "status": "next",
   "dep": "T-209"
  },
  {
   "id": "T-211",
   "obj": "2.3",
   "title": "Rebuild the serve on-ramp: one form, one follow-up owner",
   "owner": "P. Whitfield",
   "start": "2026-10-12",
   "due": "2026-12-18",
   "status": "next",
   "dep": "T-209"
  },
  {
   "id": "T-212",
   "obj": "2.3",
   "title": "Run a serve fair after both services",
   "owner": "P. Whitfield",
   "start": "2027-01-11",
   "due": "2027-02-08",
   "status": "next",
   "dep": "T-211"
  },
  {
   "id": "T-301",
   "obj": "3.1",
   "title": "Map organizations already working in Belvedere Park",
   "owner": "D. Castellanos",
   "start": "2026-08-24",
   "due": "2026-09-25",
   "status": "doing"
  },
  {
   "id": "T-301.1",
   "parent": "T-301",
   "obj": "3.1",
   "title": "Pull the list of orgs from the county",
   "owner": "D. Castellanos",
   "start": "2026-08-24",
   "due": "2026-09-25",
   "status": "done"
  },
  {
   "id": "T-301.2",
   "parent": "T-301",
   "obj": "3.1",
   "title": "Site visits — 5 organizations",
   "owner": "D. Castellanos",
   "start": "2026-08-24",
   "due": "2026-09-25",
   "status": "doing"
  },
  {
   "id": "T-301.3",
   "parent": "T-301",
   "obj": "3.1",
   "title": "Score against our capacity to help",
   "owner": "D. Castellanos",
   "start": "2026-08-24",
   "due": "2026-09-25",
   "status": "next"
  },
  {
   "id": "T-301.4",
   "parent": "T-301",
   "obj": "3.1",
   "title": "Shortlist to 4",
   "owner": "D. Castellanos",
   "start": "2026-08-24",
   "due": "2026-09-25",
   "status": "next"
  },
  {
   "id": "T-302",
   "obj": "3.1",
   "title": "Convert the existing outreach relationship into a written agreement",
   "owner": "D. Castellanos",
   "start": "2026-09-28",
   "due": "2026-11-20",
   "status": "next",
   "dep": "T-301"
  },
  {
   "id": "T-303",
   "obj": "3.1",
   "title": "Identify and approach two more anchor partners",
   "owner": "D. Castellanos",
   "start": "2026-11-23",
   "due": "2027-04-30",
   "status": "next",
   "dep": "T-301"
  },
  {
   "id": "T-304",
   "obj": "3.1",
   "title": "Stand up volunteer-hour tracking by partnership",
   "owner": "K. Delaney",
   "start": "2026-10-05",
   "due": "2026-11-27",
   "status": "next"
  },
  {
   "id": "T-305",
   "obj": "3.2",
   "title": "Pull census tract demographics and set the baseline gap",
   "owner": "K. Delaney",
   "start": "2026-09-01",
   "due": "2026-09-11",
   "status": "done"
  },
  {
   "id": "T-306",
   "obj": "3.2",
   "title": "Name what we would have to change to be a neighborhood church",
   "owner": "Elder board",
   "start": "2026-10-05",
   "due": "2026-12-18",
   "status": "next"
  },
  {
   "id": "T-307",
   "obj": "3.2",
   "title": "Build the guest-teacher bench",
   "owner": "S. Ibrahim",
   "start": "2026-11-02",
   "due": "2027-03-26",
   "status": "next"
  },
  {
   "id": "T-308",
   "obj": "3.3",
   "title": "Commission the building options study",
   "owner": "R. Alvarez",
   "start": "2026-11-02",
   "due": "2026-12-11",
   "status": "next"
  },
  {
   "id": "T-308.1",
   "parent": "T-308",
   "obj": "3.3",
   "title": "Write the study brief",
   "owner": "R. Alvarez",
   "start": "2026-11-02",
   "due": "2026-12-11",
   "status": "next"
  },
  {
   "id": "T-308.2",
   "parent": "T-308",
   "obj": "3.3",
   "title": "Get three quotes",
   "owner": "R. Alvarez",
   "start": "2026-11-02",
   "due": "2026-12-11",
   "status": "next"
  },
  {
   "id": "T-308.3",
   "parent": "T-308",
   "obj": "3.3",
   "title": "Elder approval of scope and spend",
   "owner": "R. Alvarez",
   "start": "2026-11-02",
   "due": "2026-12-11",
   "status": "next"
  },
  {
   "id": "T-309",
   "obj": "3.3",
   "title": "Run the study: stay, expand, share, relocate",
   "owner": "R. Alvarez",
   "start": "2027-01-04",
   "due": "2027-03-26",
   "status": "next",
   "dep": "T-308"
  },
  {
   "id": "T-310",
   "obj": "3.3",
   "title": "Board decision on the building question",
   "owner": "Elder board",
   "start": "2027-04-05",
   "due": "2027-06-25",
   "status": "next",
   "dep": "T-309"
  },
  {
   "id": "T-401",
   "obj": "4.1",
   "title": "Benchmark elder models at four comparable churches",
   "owner": "Elder board",
   "start": "2026-08-24",
   "due": "2026-09-25",
   "status": "doing"
  },
  {
   "id": "T-401.1",
   "parent": "T-401",
   "obj": "4.1",
   "title": "Identify 4 comparable churches",
   "owner": "Elder board",
   "start": "2026-08-24",
   "due": "2026-09-25",
   "status": "done"
  },
  {
   "id": "T-401.2",
   "parent": "T-401",
   "obj": "4.1",
   "title": "Interview each on term structure",
   "owner": "Elder board",
   "start": "2026-08-24",
   "due": "2026-09-25",
   "status": "doing"
  },
  {
   "id": "T-401.3",
   "parent": "T-401",
   "obj": "4.1",
   "title": "Write the comparison memo",
   "owner": "Elder board",
   "start": "2026-08-24",
   "due": "2026-09-25",
   "status": "next"
  },
  {
   "id": "T-402",
   "obj": "4.1",
   "title": "Draft the revised elder model: terms, path, nominating calendar",
   "owner": "Elder board",
   "start": "2026-09-28",
   "due": "2026-11-27",
   "status": "next",
   "dep": "T-401"
  },
  {
   "id": "T-403",
   "obj": "4.1",
   "title": "Congregational teaching on the revised model",
   "owner": "Elder board",
   "start": "2026-11-30",
   "due": "2027-01-15",
   "status": "next",
   "dep": "T-402"
  },
  {
   "id": "T-404",
   "obj": "4.1",
   "title": "Adopt the model and open the first nominating window",
   "owner": "Elder board",
   "start": "2027-01-18",
   "due": "2027-01-29",
   "status": "next",
   "dep": "T-403"
  },
  {
   "id": "T-405",
   "obj": "4.2",
   "title": "Build the 12-month cash forecast",
   "owner": "Good Work",
   "start": "2026-09-01",
   "due": "2026-09-11",
   "status": "done"
  },
  {
   "id": "T-406",
   "obj": "4.2",
   "title": "Set the reserve policy and adopt it",
   "owner": "Elder board",
   "start": "2026-09-14",
   "due": "2026-10-30",
   "status": "doing"
  },
  {
   "id": "T-406.1",
   "parent": "T-406",
   "obj": "4.2",
   "title": "Draft the policy — target months and replenishment rule",
   "owner": "Elder board",
   "start": "2026-09-14",
   "due": "2026-10-30",
   "status": "done"
  },
  {
   "id": "T-406.2",
   "parent": "T-406",
   "obj": "4.2",
   "title": "Model it against the 12-month forecast",
   "owner": "Elder board",
   "start": "2026-09-14",
   "due": "2026-10-30",
   "status": "doing"
  },
  {
   "id": "T-406.3",
   "parent": "T-406",
   "obj": "4.2",
   "title": "Elder adoption",
   "owner": "Elder board",
   "start": "2026-09-14",
   "due": "2026-10-30",
   "status": "next"
  },
  {
   "id": "T-407",
   "obj": "4.2",
   "title": "Analyze giving concentration and dependency risk",
   "owner": "Good Work",
   "start": "2026-09-01",
   "due": "2026-09-04",
   "status": "done"
  },
  {
   "id": "T-408",
   "obj": "4.2",
   "title": "Run a generosity series tied to the plan, not the budget",
   "owner": "M. Okonkwo",
   "start": "2027-01-04",
   "due": "2027-02-26",
   "status": "next"
  },
  {
   "id": "T-409",
   "obj": "4.3",
   "title": "Elder study on women in leadership — reach a stated position",
   "owner": "Elder board",
   "start": "2026-09-07",
   "due": "2027-03-26",
   "status": "doing"
  },
  {
   "id": "T-409.1",
   "parent": "T-409",
   "obj": "4.3",
   "title": "Agree the study method and sources",
   "owner": "Elder board",
   "start": "2026-09-07",
   "due": "2027-03-26",
   "status": "done"
  },
  {
   "id": "T-409.2",
   "parent": "T-409",
   "obj": "4.3",
   "title": "Four study sessions",
   "owner": "Elder board",
   "start": "2026-09-07",
   "due": "2027-03-26",
   "status": "doing"
  },
  {
   "id": "T-409.3",
   "parent": "T-409",
   "obj": "4.3",
   "title": "Draft a stated position",
   "owner": "Elder board",
   "start": "2026-09-07",
   "due": "2027-03-26",
   "status": "next"
  },
  {
   "id": "T-409.4",
   "parent": "T-409",
   "obj": "4.3",
   "title": "Congregational listening session",
   "owner": "Elder board",
   "start": "2026-09-07",
   "due": "2027-03-26",
   "status": "next"
  },
  {
   "id": "T-410",
   "obj": "4.3",
   "title": "Draft the disagreement covenant",
   "owner": "S. Ibrahim",
   "start": "2026-10-05",
   "due": "2026-12-18",
   "status": "next"
  },
  {
   "id": "T-410.1",
   "parent": "T-410",
   "obj": "4.3",
   "title": "Review three covenants from other churches",
   "owner": "S. Ibrahim",
   "start": "2026-10-05",
   "due": "2026-12-18",
   "status": "next"
  },
  {
   "id": "T-410.2",
   "parent": "T-410",
   "obj": "4.3",
   "title": "Draft our version",
   "owner": "S. Ibrahim",
   "start": "2026-10-05",
   "due": "2026-12-18",
   "status": "next"
  },
  {
   "id": "T-410.3",
   "parent": "T-410",
   "obj": "4.3",
   "title": "Test with two Life Groups",
   "owner": "S. Ibrahim",
   "start": "2026-10-05",
   "due": "2026-12-18",
   "status": "next"
  },
  {
   "id": "T-411",
   "obj": "4.3",
   "title": "Adopt the covenant and teach it congregationally",
   "owner": "Elder board",
   "start": "2027-01-04",
   "due": "2027-02-26",
   "status": "next",
   "dep": "T-410"
  },
  {
   "id": "T-412",
   "obj": "4.3",
   "title": "Publish the position papers",
   "owner": "Elder board",
   "start": "2027-03-29",
   "due": "2027-05-28",
   "status": "blocked",
   "dep": "T-409"
  }
 ]
};
