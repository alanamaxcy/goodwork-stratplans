/* Engagement, plan and workplan content for one client portal.
   In the product this is the per-client record; here it is illustrative
   content written against that client's real discovery findings. */
window.PORTAL = {
  client: {
    name: 'Resonate Church',
    place: 'Belvedere Park · Decatur, GA',
    engagement: 'Strategic Plan 2026–2028',
    adopted: '2026-08-18',
  },
  firm: { name: 'Good Work Atlanta', lead: 'Alan Maxcy' },

  /* today's date drives "late" and the phase rail; the product reads the clock */
  today: '2026-09-15',

  phases: [
    {
      id: 'p1',
      n: 1,
      name: 'Discovery',
      start: '2026-02-02',
      end: '2026-03-27',
      status: 'done',
      blurb: 'Listen widely enough that nobody can say the plan came from one room.',
      deliverables: ['Congregational survey (96 responses)', '7 leader interviews', 'Staff focus group', 'Ministry partner focus group'],
      note: '105 sources of input. 92% of survey respondents answered at least one open-ended question.',
    },
    {
      id: 'p2',
      n: 2,
      name: 'Synthesis',
      start: '2026-03-30',
      end: '2026-05-08',
      status: 'done',
      blurb: 'Code every response, name the themes, count how many sources carry each one.',
      deliverables: ['43 coded themes across SWOT', 'Findings Explorer (this portal, §3)', 'Elder findings session'],
      note: 'Delivered as an interactive explorer rather than an appendix. Every theme carries its source count.',
    },
    {
      id: 'p3',
      n: 3,
      name: 'Plan design',
      start: '2026-05-11',
      end: '2026-07-10',
      status: 'done',
      blurb: 'Turn what we heard into four pillars a board can hold in its head.',
      deliverables: ['Two-day leadership retreat', 'Pillar and objective drafting', 'Measures workshop'],
      note: 'Every objective had to name the findings that produced it. Three draft objectives were cut for lack of evidence.',
    },
    {
      id: 'p4',
      n: 4,
      name: 'Adoption',
      start: '2026-07-13',
      end: '2026-08-21',
      status: 'done',
      blurb: 'Get it approved by the people who will be accountable for it.',
      deliverables: ['Elder review draft', 'Congregational presentation', 'Board adoption vote'],
      note: 'Adopted unanimously 18 Aug 2026.',
    },
    {
      id: 'p5',
      n: 5,
      name: 'Implementation',
      start: '2026-08-24',
      end: '2027-08-20',
      status: 'active',
      blurb: 'The plan becomes a workplan, and the workplan gets worked.',
      deliverables: ['Quarterly progress reviews', 'Owner coaching sessions', 'Annual plan refresh'],
      note: 'Quarterly review cadence. Next review 20 Nov 2026.',
    },
  ],

  scope: {
    inScope: [
      'Congregation-wide and leadership discovery',
      'SWOT synthesis with source counts',
      'Three-year plan: pillars, objectives, measures',
      'Year-one workplan with named owners',
      'Quarterly implementation coaching through Aug 2027',
    ],
    outOfScope: [
      'Lead pastor search execution — the committee owns this; the plan tracks its milestones only',
      'Capital campaign design (revisit after the building decision in §2, Objective 3.3)',
      'Staff compensation study',
      'Facility architectural work',
    ],
    cadence: [
      { label: 'Quarterly review', detail: 'Elders + staff leads + Good Work · 90 min', next: '2026-11-20' },
      { label: 'Owner check-in', detail: 'Per-owner coaching · 30 min · monthly', next: '2026-10-06' },
      { label: 'Annual refresh', detail: 'Re-run the pulse survey, reset year-two targets', next: '2027-06-15' },
    ],
    team: [
      { name: 'Alan Maxcy', role: 'Engagement lead', org: 'Good Work Atlanta' },
      { name: 'R. Alvarez', role: 'Executive pastor', org: 'Resonate' },
      { name: 'Elder board', role: 'Plan owner', org: 'Resonate' },
      { name: 'Search committee', role: 'Pastor search (parallel track)', org: 'Resonate' },
    ],
  },

  plan: {
    vision:
      'A church whose community is strong enough to multiply, whose people are equipped to disciple, and whose life is genuinely bound to the neighborhood it sits in — governed well enough to survive a pastoral transition.',
    framing:
      'Four pillars, twelve objectives, three years. Each objective names the discovery findings that produced it and the measure that will tell us whether it worked. The lead pastor search runs alongside as its own track.',
    pillars: [
      {
        id: 'P1',
        title: 'Life Groups that multiply',
        color: 'c1',
        thesis:
          'Life Groups are the most-named strength in the study (101 of 105 sources) and the most-named weakness (49). The same structure that formed this church is now the structure limiting it. The work is not to fix what people love — it is to give it a path to multiply.',
        evidence: ['s1', 'w1', 'o12', 's7'],
        objectives: [
          {
            id: '1.1',
            title: 'Define what a Life Group is for',
            detail:
              'One page, adopted by the elders: purpose, minimum commitments, what a group owes its members and the church. Discovery found leaders running four different implicit models.',
            evidence: ['w1', 's1'],
            measures: [
              { text: 'Charter adopted by elders', target: 'Nov 2026', now: 'Draft in elder review' },
              { text: 'Life Group leaders trained on the charter', target: '100% by Feb 2027', now: '0 of 22' },
            ],
          },
          {
            id: '1.2',
            title: 'Build a multiplication path',
            detail:
              'An apprentice role in every group, a named trigger for when a group divides, and a leader bench deep enough that multiplying does not cost the church a group.',
            evidence: ['w1', 'o12', 's3'],
            measures: [
              { text: 'Groups with a named apprentice', target: '18 of 22 by Aug 2027', now: '5 of 22' },
              { text: 'Groups multiplied', target: '4 groups into 8 by Aug 2027', now: '0' },
            ],
          },
          {
            id: '1.3',
            title: 'Open the front door',
            detail:
              'Discovery was blunt: groups are closed, geographically lopsided, and hard to enter if you work evenings or have young kids. Placement should not depend on knowing the right person.',
            evidence: ['w1', 'w11', 's1'],
            measures: [
              { text: 'Median days from first visit to group placement', target: 'Under 45 by Aug 2027', now: 'Not yet measured' },
              { text: 'Groups meeting outside Tue/Wed evening', target: '6 by Aug 2027', now: '2' },
            ],
          },
        ],
      },
      {
        id: 'P2',
        title: 'A discipleship and leadership pipeline',
        color: 'c2',
        thesis:
          'Teaching is the second-strongest asset in the study (81 sources). The absence of formal discipleship is the second-largest weakness (36), and 19 sources named the application gap directly: people are taught well and then left to work out what to do about it alone. The gap is not content. It is a path.',
        evidence: ['s2', 'w2', 'w7', 'o3', 'o6', 'w5', 's3'],
        objectives: [
          {
            id: '2.1',
            title: 'Publish a discipleship pathway',
            detail:
              'Named next steps a person can actually take, in order, from first visit to leading others. Written down, visible, and owned by someone.',
            evidence: ['w2', 'o3', 'w7'],
            measures: [
              { text: 'Pathway published and in use', target: 'Mar 2027', now: 'Outline drafted' },
              { text: 'Adults who can name their next step (pulse survey)', target: '60% by Jun 2027', now: '23% (Feb 2026 baseline)' },
            ],
          },
          {
            id: '2.2',
            title: 'Open the leadership pipeline',
            detail:
              'Build a bench that looks like the congregation and the neighborhood — including women and people of color — with a stated path into teaching, group leadership, and eldership.',
            evidence: ['o6', 'w3', 'w4'],
            measures: [
              { text: 'Leadership cohort launched', target: 'Feb 2027', now: 'Recruiting' },
              { text: 'Cohort reflects congregation demographics', target: 'Within 10 pts by Aug 2027', now: 'n/a' },
            ],
          },
          {
            id: '2.3',
            title: 'Rebuild "everybody plays"',
            detail:
              '"Everybody plays" is still named as a strength (40 sources) and its decline as a weakness (20). Both are true: the culture is remembered, the practice has thinned. Rebuild the on-ramp.',
            evidence: ['s3', 'w5'],
            measures: [
              { text: 'Adults serving in a named role', target: '55% by Aug 2027', now: '38%' },
              { text: 'Roles with a written description and a named lead', target: 'All by May 2027', now: '9 of 31' },
            ],
          },
        ],
      },
      {
        id: 'P3',
        title: 'A church of Belvedere Park',
        color: 'c3',
        thesis:
          'Deeper neighborhood engagement is the second-highest opportunity in the study (58 sources), and the local outreach work already underway is a named strength (32). But 8 sources named the honest tension: we say we want the neighborhood without being willing to change for it. And 34 named the gap between who is in the room and who lives around it.',
        evidence: ['o2', 's6', 'w12', 'w3', 't3'],
        objectives: [
          {
            id: '3.1',
            title: 'Move from events to partnerships',
            detail:
              'Fewer one-off service days, more committed relationships with organizations already doing the work — with written agreements, named liaisons, and a multi-year horizon.',
            evidence: ['o2', 's6', 'w12'],
            measures: [
              { text: 'Anchor partnerships with signed agreements', target: '3 by Aug 2027', now: '1' },
              { text: 'Volunteer hours into anchor partnerships', target: '1,200/yr by 2027', now: '410' },
            ],
          },
          {
            id: '3.2',
            title: 'Close the gap between who we are and who lives here',
            detail:
              'Discovery named diversity gaps across ethnicity, age, family stage, and income. This objective sets a measurable target rather than a statement of intent, and locates the work in hiring, teaching voices, and leadership.',
            evidence: ['w3', 'o6', 'w12'],
            measures: [
              { text: 'Teaching voices from outside the current staff', target: '8 per year by 2027', now: '2' },
              { text: 'Congregation vs. tract demographics gap', target: 'Narrow by 15 pts by 2028', now: 'Baseline set Feb 2026' },
            ],
          },
          {
            id: '3.3',
            title: 'Decide the building question',
            detail:
              'Space limits came up 18 times, and Belvedere Plaza is changing around us (16 sources). Stay, expand, or share — decide it, on evidence, by mid-2027, so the rest of the plan can assume an answer.',
            evidence: ['w8', 't3', 'o2'],
            measures: [
              { text: 'Options study complete', target: 'Mar 2027', now: 'Not started' },
              { text: 'Board decision recorded', target: 'Jun 2027', now: 'Pending study' },
            ],
          },
        ],
      },
      {
        id: 'P4',
        title: 'Govern for the next decade',
        color: 'c4',
        thesis:
          'The elder pipeline is broken (20 sources), governance and systems are thin (14), and the church is entering a pastoral transition that 79 sources named its biggest opportunity and 16 named a real risk. Structure is what makes a transition survivable rather than decisive.',
        evidence: ['w6', 'o7', 'w9', 'o11', 't1', 'w4', 't4'],
        objectives: [
          {
            id: '4.1',
            title: 'Redesign the elder model and pipeline',
            detail:
              'A stated term structure, a written path to eldership, and a nominating process that runs on a calendar rather than on who happens to be available.',
            evidence: ['w6', 'o7', 'o11'],
            measures: [
              { text: 'Revised elder model adopted', target: 'Jan 2027', now: 'Proposal drafted' },
              { text: 'Qualified candidates in the pipeline', target: '6 by Aug 2027', now: '2' },
            ],
          },
          {
            id: '4.2',
            title: 'Build financial resilience',
            detail:
              'Economic pressure on giving capacity was the single most-named threat (26 sources). Build the reserve and diversify before the transition, not during it.',
            evidence: ['t1', 'w9', 't5'],
            measures: [
              { text: 'Operating reserve', target: '4 months by Aug 2027', now: '1.8 months' },
              { text: 'Giving concentration in top 10 households', target: 'Under 30% by 2028', now: '41%' },
            ],
          },
          {
            id: '4.3',
            title: 'Say where we stand',
            detail:
              '23 sources described a "fuzzy" culture around disagreement and unclear positions on women in leadership and LGBTQ inclusion. The finding is not which position to hold — it is that ambiguity is itself costing trust. Write the positions down and write down how we disagree well.',
            evidence: ['w4', 's5', 't2'],
            measures: [
              { text: 'Position papers published', target: 'May 2027', now: 'Elder study underway' },
              { text: 'Disagreement covenant adopted', target: 'Feb 2027', now: 'Not started' },
            ],
          },
        ],
      },
    ],
    track: {
      id: 'TRK',
      title: 'Lead pastor search',
      note:
        'Named by 79 of 105 sources as the top opportunity and by 16 as a top risk — the highest-consensus finding in the study. It runs as its own track on its own clock, owned by the search committee. The plan tracks its milestones; it does not run it.',
      evidence: ['o1', 't4', 's10'],
      milestones: [
        { label: 'Committee seated', date: '2026-09-08', status: 'done' },
        { label: 'Profile published', date: '2026-10-30', status: 'doing' },
        { label: 'Candidate slate to elders', date: '2027-02-26', status: 'next' },
        { label: 'Call extended', date: '2027-05-28', status: 'next' },
      ],
    },
  },

  /* Year-one workplan. Status: done | doing | next | blocked */
  tasks: [
    { id: 'T-101', obj: '1.1', title: 'Interview 8 Life Group leaders on the implicit models in use', owner: 'R. Alvarez', start: '2026-08-24', due: '2026-09-11', status: 'done' },
    { id: 'T-102', obj: '1.1', title: 'Draft the one-page Life Group charter', owner: 'R. Alvarez', start: '2026-09-14', due: '2026-10-02', status: 'doing' },
    { id: 'T-103', obj: '1.1', title: 'Elder review and adoption of the charter', owner: 'Elder board', start: '2026-10-05', due: '2026-11-13', status: 'next', dep: 'T-102' },
    { id: 'T-104', obj: '1.1', title: 'Run two charter training sessions for group leaders', owner: 'J. Tran', start: '2026-11-16', due: '2027-02-12', status: 'next', dep: 'T-103' },
    { id: 'T-105', obj: '1.2', title: 'Define the apprentice role and its expectations', owner: 'J. Tran', start: '2026-09-07', due: '2026-09-25', status: 'doing' },
    { id: 'T-106', obj: '1.2', title: 'Name the multiplication trigger (size, tenure, leader readiness)', owner: 'R. Alvarez', start: '2026-09-28', due: '2026-10-23', status: 'next', dep: 'T-105' },
    { id: 'T-107', obj: '1.2', title: 'Recruit apprentices in the 10 largest groups', owner: 'J. Tran', start: '2026-10-26', due: '2027-01-29', status: 'next', dep: 'T-105' },
    { id: 'T-108', obj: '1.2', title: 'Pilot the first two group multiplications', owner: 'J. Tran', start: '2027-02-01', due: '2027-04-30', status: 'next', dep: 'T-107' },
    { id: 'T-109', obj: '1.3', title: 'Instrument first-visit to group-placement timing', owner: 'K. Delaney', start: '2026-09-01', due: '2026-09-12', status: 'late' },
    { id: 'T-110', obj: '1.3', title: 'Map current group geography against where attenders live', owner: 'K. Delaney', start: '2026-09-21', due: '2026-10-16', status: 'next' },
    { id: 'T-111', obj: '1.3', title: 'Launch two daytime or weekend groups', owner: 'J. Tran', start: '2027-01-04', due: '2027-03-26', status: 'next', dep: 'T-110' },
    { id: 'T-112', obj: '1.3', title: 'Publish an open-groups directory anyone can join from', owner: 'K. Delaney', start: '2026-10-19', due: '2026-12-11', status: 'next', dep: 'T-110' },

    { id: 'T-201', obj: '2.1', title: 'Audit what discipleship content already exists', owner: 'M. Okonkwo', start: '2026-08-24', due: '2026-09-18', status: 'doing' },
    { id: 'T-202', obj: '2.1', title: 'Draft the pathway: first visit → member → disciple-maker', owner: 'M. Okonkwo', start: '2026-09-21', due: '2026-11-20', status: 'next', dep: 'T-201' },
    { id: 'T-203', obj: '2.1', title: 'Test the draft pathway with 12 adults across life stages', owner: 'M. Okonkwo', start: '2026-11-23', due: '2027-01-15', status: 'next', dep: 'T-202' },
    { id: 'T-204', obj: '2.1', title: 'Publish the pathway and train staff to point at it', owner: 'M. Okonkwo', start: '2027-01-18', due: '2027-03-19', status: 'next', dep: 'T-203' },
    { id: 'T-205', obj: '2.2', title: 'Write the leadership cohort curriculum and selection criteria', owner: 'S. Ibrahim', start: '2026-09-14', due: '2026-11-06', status: 'doing' },
    { id: 'T-206', obj: '2.2', title: 'Recruit the first cohort — 12 people, demographics tracked', owner: 'S. Ibrahim', start: '2026-11-09', due: '2027-01-29', status: 'next', dep: 'T-205' },
    { id: 'T-207', obj: '2.2', title: 'Launch cohort one', owner: 'S. Ibrahim', start: '2027-02-01', due: '2027-02-26', status: 'next', dep: 'T-206' },
    { id: 'T-208', obj: '2.2', title: 'Add three new teaching voices to the Sunday rotation', owner: 'Elder board', start: '2026-10-01', due: '2027-05-28', status: 'next' },
    { id: 'T-209', obj: '2.3', title: 'Inventory every volunteer role and who leads it', owner: 'P. Whitfield', start: '2026-09-07', due: '2026-10-09', status: 'doing' },
    { id: 'T-210', obj: '2.3', title: 'Write role descriptions for the 22 roles that have none', owner: 'P. Whitfield', start: '2026-10-12', due: '2027-05-14', status: 'next', dep: 'T-209' },
    { id: 'T-211', obj: '2.3', title: 'Rebuild the serve on-ramp: one form, one follow-up owner', owner: 'P. Whitfield', start: '2026-10-12', due: '2026-12-18', status: 'next', dep: 'T-209' },
    { id: 'T-212', obj: '2.3', title: 'Run a serve fair after both services', owner: 'P. Whitfield', start: '2027-01-11', due: '2027-02-08', status: 'next', dep: 'T-211' },

    { id: 'T-301', obj: '3.1', title: 'Map organizations already working in Belvedere Park', owner: 'D. Castellanos', start: '2026-08-24', due: '2026-09-25', status: 'doing' },
    { id: 'T-302', obj: '3.1', title: 'Convert the existing outreach relationship into a written agreement', owner: 'D. Castellanos', start: '2026-09-28', due: '2026-11-20', status: 'next', dep: 'T-301' },
    { id: 'T-303', obj: '3.1', title: 'Identify and approach two more anchor partners', owner: 'D. Castellanos', start: '2026-11-23', due: '2027-04-30', status: 'next', dep: 'T-301' },
    { id: 'T-304', obj: '3.1', title: 'Stand up volunteer-hour tracking by partnership', owner: 'K. Delaney', start: '2026-10-05', due: '2026-11-27', status: 'next' },
    { id: 'T-305', obj: '3.2', title: 'Pull census tract demographics and set the baseline gap', owner: 'K. Delaney', start: '2026-09-01', due: '2026-09-11', status: 'done' },
    { id: 'T-306', obj: '3.2', title: 'Name what we would have to change to be a neighborhood church', owner: 'Elder board', start: '2026-10-05', due: '2026-12-18', status: 'next' },
    { id: 'T-307', obj: '3.2', title: 'Build the guest-teacher bench', owner: 'S. Ibrahim', start: '2026-11-02', due: '2027-03-26', status: 'next' },
    { id: 'T-308', obj: '3.3', title: 'Commission the building options study', owner: 'R. Alvarez', start: '2026-11-02', due: '2026-12-11', status: 'next' },
    { id: 'T-309', obj: '3.3', title: 'Run the study: stay, expand, share, relocate', owner: 'R. Alvarez', start: '2027-01-04', due: '2027-03-26', status: 'next', dep: 'T-308' },
    { id: 'T-310', obj: '3.3', title: 'Board decision on the building question', owner: 'Elder board', start: '2027-04-05', due: '2027-06-25', status: 'next', dep: 'T-309' },

    { id: 'T-401', obj: '4.1', title: 'Benchmark elder models at four comparable churches', owner: 'Elder board', start: '2026-08-24', due: '2026-09-25', status: 'doing' },
    { id: 'T-402', obj: '4.1', title: 'Draft the revised elder model: terms, path, nominating calendar', owner: 'Elder board', start: '2026-09-28', due: '2026-11-27', status: 'next', dep: 'T-401' },
    { id: 'T-403', obj: '4.1', title: 'Congregational teaching on the revised model', owner: 'Elder board', start: '2026-11-30', due: '2027-01-15', status: 'next', dep: 'T-402' },
    { id: 'T-404', obj: '4.1', title: 'Adopt the model and open the first nominating window', owner: 'Elder board', start: '2027-01-18', due: '2027-01-29', status: 'next', dep: 'T-403' },
    { id: 'T-405', obj: '4.2', title: 'Build the 12-month cash forecast', owner: 'Good Work', start: '2026-09-01', due: '2026-09-11', status: 'done' },
    { id: 'T-406', obj: '4.2', title: 'Set the reserve policy and adopt it', owner: 'Elder board', start: '2026-09-14', due: '2026-10-30', status: 'doing' },
    { id: 'T-407', obj: '4.2', title: 'Analyze giving concentration and dependency risk', owner: 'Good Work', start: '2026-09-01', due: '2026-09-04', status: 'done' },
    { id: 'T-408', obj: '4.2', title: 'Run a generosity series tied to the plan, not the budget', owner: 'M. Okonkwo', start: '2027-01-04', due: '2027-02-26', status: 'next' },
    { id: 'T-409', obj: '4.3', title: 'Elder study on women in leadership — reach a stated position', owner: 'Elder board', start: '2026-09-07', due: '2027-03-26', status: 'doing' },
    { id: 'T-410', obj: '4.3', title: 'Draft the disagreement covenant', owner: 'S. Ibrahim', start: '2026-10-05', due: '2026-12-18', status: 'next' },
    { id: 'T-411', obj: '4.3', title: 'Adopt the covenant and teach it congregationally', owner: 'Elder board', start: '2027-01-04', due: '2027-02-26', status: 'next', dep: 'T-410' },
    { id: 'T-412', obj: '4.3', title: 'Publish the position papers', owner: 'Elder board', start: '2027-03-29', due: '2027-05-28', status: 'blocked', dep: 'T-409' },
  ],
};
