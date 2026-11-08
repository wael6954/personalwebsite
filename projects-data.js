// Project data for the Shelter Row (the poster street that opens from the (i)
// button above the Projects sign). One entry per project; edit here.
//   poster.head   -> the big line(s) on the poster. Real facts only.
//   poster.cap    -> one plain sentence under it.
//   poster.layout -> 'stack' | 'foot' | 'split'
window.PROJECTS = [
  {
    title: 'Automated Speed Enforcement Evaluation', year: '2026', area: 'Transportation',
    tags: ['Python', 'SQL', 'Transportation Analytics'],
    html: `<p>Designed and deployed an automated system that evaluates the impacts of automated speed enforcement (ASE) camera removals across Toronto. Built analytics pipelines on city-wide traffic data to monitor roadway performance and support policy evaluation. The analyses informed <strong>City Council</strong> reporting and were discussed publicly by the <strong>Mayor</strong>.</p>`,
    poster: { viz: { type: 'road' }, head: ['Speed', 'cameras'], cap: 'Cameras were removed across Toronto. The analysis informed City Council reporting, and the Mayor discussed it publicly.', ground: '#b5432f', ink: '#f3efe6', accent: '#22303f', layout: 'stack' },
  },
  {
    title: 'World Cup Congestion Monitoring', year: '2026', area: 'Transportation',
    tags: ['Python', 'SQL', 'Geospatial'],
    html: `<p>Developed automated congestion monitoring workflows supporting the <strong>City of Toronto</strong>'s transportation planning for the <strong>World Cup</strong>. Built repeatable Python and SQL pipelines to monitor network performance, identify congestion trends, and generate operational insights.</p>`,
    poster: { viz: { type: 'network' }, head: ['World Cup', 'traffic'], cap: 'Automated congestion monitoring for the City of Toronto’s World Cup transportation planning.', ground: '#141a33', ink: '#ffcb6e', accent: '#2f7ca8', layout: 'foot' },
  },
  {
    title: 'Prioritizing Wildlife Crossing Sites on Alberta Highways', year: '2026', area: 'Transportation',
    tags: ['CME538 team project', 'Python', 'GeoPandas', 'Statistical Modelling'],
    html: `<p>Led the analysis and modelling for a team project that ranks <strong>29,868 km</strong> of Alberta highway by wildlife-vehicle collision risk, to help show where crossing structures could prevent the most collisions. Built a reproducible 13-stage pipeline that cuts the network into <strong>15,000 segments</strong>, snaps <strong>52,000 carcass records</strong> onto them, and joins road, traffic, habitat, terrain and animal-abundance data. A negative binomial model scores every segment, validated on highways and years it never saw: the top 10% of segments capture <strong>48.5%</strong> of observed records, nearly five times random. Benchmarked against boosted trees, hurdle, LDA and logistic models, and checked for data leakage. Results feed an interactive risk map.</p>`,
    links: [
      { label: 'Open the interactive risk map', href: './wildlife-risk/map' },
      { label: 'See the pipeline diagram', href: './wildlife-risk/pipeline' },
    ],
    poster: { head: ['48.5%'], viz: { type: 'segments', segments: 15000, topPct: 10, sharePct: 48.5, randomPct: 10 }, cap: 'On highways it never saw, 48.5% of wildlife collision records fall in the top 10% of ranked segments. Random would give 10%.', ground: '#3f9457', ink: '#f3efe6', accent: '#22303f', layout: 'split' },
  },
  {
    title: 'ShiftED (Dynamic Triage Monitoring)', year: '2026', area: 'Healthcare',
    tags: ['AI/ML', 'Healthcare', 'Hackathon winner'],
    html: `<p><strong>Winner of the Translational AIxBio Hackathon.</strong> An AI-powered patient-monitoring platform that learns individualized physiological baselines from wearables to detect early deterioration. Now being developed as a <strong>startup</strong>.</p>`,
    poster: { viz: { type: 'baseline' }, head: ['Hackathon', 'winner'], cap: 'Won the Translational AIxBio Hackathon with patient monitoring that learns each person’s baseline from wearables.', ground: '#f3efe6', ink: '#7a5fa8', accent: '#22303f', layout: 'stack' },
  },
  {
    title: 'Forecasting AI\'s Effect on Hospital Costs by Analogy to Industrialization and the Dot-Com Era', year: '2026', area: 'Healthcare',
    tags: ['Healthcare Economics', 'Data Analysis'],
    html: `<p>Placed <strong>10th out of 328 participants</strong> (100+ teams) at the <strong>NSRI Summer Research Hackathon</strong>. Tested AI's likely effect on hospital costs against two historical analogies, the slow productivity gains after electrification and the dot-com boom and bust, using Medicare Cost Report data across <strong>about 6,000 hospitals (2011 to 2024)</strong>. Found that the administrative share of costs has climbed steadily since electronic health record (EHR) adoption saturated, with no reversal, and is forecast to keep rising through 2034, while clinical AI funding already shows classic bubble markers.</p>`,
    links: [{ label: 'Read the report', href: 'https://drive.google.com/file/d/10VRXw-quCoEKi6b_xzLqa2NRpXvIypUe/view?pli=1', ext: true }],
    poster: { viz: { type: 'rank', rank: 10, of: 328, hospitals: 6000, years: '2011-2024' }, head: ['10th of', '328'], cap: 'Placed 10th at the NSRI hackathon, forecasting AI’s effect on hospital costs from data on about 6,000 hospitals.', ground: '#2f7ca8', ink: '#f3efe6', accent: '#141a33', layout: 'foot', short: 'Forecasting AI’s Effect on Hospital Costs' },
  },
  {
    title: 'Restaurant Taste Model', year: '2026', area: 'Machine learning',
    tags: ['Proof of concept', 'Python', 'scikit-learn', 'NLP'],
    html: `<p>A proof of concept that predicts how two friends would rank Toronto restaurants from the way Yelp reviewers describe them. It embeds <strong>37,509 review sentences</strong>, groups them into 166 topics, and fits a ridge regression per person on 24 aspect features, then combines both predictions into group picks. Held-out accuracy is 0.26 and 0.38 (Spearman) against 0.17 and 0.20 for random guessing, confirmed with a permutation test. Built on two people's lists as a test of the approach, so the sample is small.</p>`,
    links: [
      { label: 'Open the interactive app', href: './taste/' },
      { label: 'View the code', href: 'https://github.com/wael6954/taste-test', ext: true },
    ],
    poster: { viz: { type: 'bars', pairs: [{ label: 'person 1', model: 0.26, random: 0.17 }, { label: 'person 2', model: 0.38, random: 0.20 }] }, head: ['37,509', 'sentences'], cap: 'Predicts how two friends would rank Toronto restaurants from Yelp review language. A small proof of concept.', ground: '#d9722f', ink: '#141a33', accent: '#f3efe6', layout: 'split' },
  },
  {
    title: 'City-Wide Bicycle Demand Estimation', year: '2025', area: 'Transportation',
    tags: ['Python', 'SQL', 'PostgreSQL'],
    html: `<p>A city-scale pipeline for <strong>Annual Average Daily Bicycle Traffic (AADT)</strong>, combining temporal normalization, seasonal adjustment, and confidence interval estimation to support cycling infrastructure planning.</p>`,
    poster: { viz: { type: 'season' }, head: ['Bike', 'traffic'], cap: 'Annual average daily bicycle traffic (AADT) for a whole city, with confidence intervals.', ground: '#f3efe6', ink: '#3f9457', accent: '#22303f', layout: 'foot' },
  },
  {
    title: 'Accessibility Modelling for Planning', year: '2025', area: 'Transportation',
    tags: ['R', 'QGIS'],
    html: `<p>Reproducible geospatial workflows computing gravity-based and cumulative accessibility measures across transportation networks, with GIS visualizations to support planning.</p>`,
    poster: { viz: { type: 'decay' }, head: ['Access', 'measured'], cap: 'Gravity-based and cumulative accessibility measures across transportation networks.', ground: '#141a33', ink: '#bfe3f2', accent: '#d9722f', layout: 'stack' },
  },
  {
    title: 'Predicting Streetcar Delays in Toronto', year: '2025', area: 'Machine learning',
    tags: ['Python', 'Machine Learning', 'Published write-up'],
    html: `<p>Analyzed <strong>over ten years</strong> of Toronto streetcar data to identify delay patterns across multiple routes. Built and validated Linear Regression and Random Forest models in Python (Pandas, scikit-learn) to predict delay durations, with Random Forest outperforming on complex, non-linear relationships. Produced a route-level performance report with insights for scheduling and service optimization.</p>`,
    links: [{ label: 'Read the write-up', href: 'https://wael-halabi.medium.com/predicting-streetcar-delays-in-toronto-using-historical-data-and-machine-learning-844cce83a09a', ext: true }],
    poster: { viz: { type: 'fit' }, head: ['Streetcar', 'delays'], cap: 'Over ten years of Toronto data. Random forest handled the non-linear patterns better than linear regression.', ground: '#cbb24e', ink: '#141a33', accent: '#f3efe6', layout: 'foot' },
  },
  {
    title: 'Streetcar Route Operations Analysis', year: '2024', area: 'Transportation',
    tags: ['Python', 'Pandas', 'Field Data', 'Published write-up'],
    html: `<p>Studied a Toronto streetcar route over <strong>three months</strong>, collecting <strong>150+ multi-point data entries</strong> to inform operational improvements. Processed the data with Python and Pandas to produce visual reports on traffic flow and scheduling patterns, and published the findings on Medium.</p>`,
    links: [{ label: 'Read the write-up', href: 'https://wael-halabi.medium.com/analysis-of-the-toronto-510-streetcar-route-patterns-and-operational-dynamics-january-2024-to-9057710a8b00', ext: true }],
    poster: { viz: { type: 'tally', entries: 150 }, head: ['150+', 'data entries'], cap: 'Field data collected over three months on one Toronto streetcar route.', ground: '#f3efe6', ink: '#b5432f', accent: '#22303f', layout: 'stack' },
  },
]
