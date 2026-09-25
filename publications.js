/*
 * Publication data. Add new entries at the top of the list.
 *
 *   year      : number, used for grouping
 *   title     : string
 *   authors   : string — occurrences of "Knolle" are highlighted automatically
 *   venue     : string, journal / conference / preprint server
 *   links     : optional array of { label, url }
 *   selected  : true to show it under the "Selected" filter
 */
window.PUBLICATIONS = [
  {
    year: 2026,
    title: "Disparate privacy risks from medical AI",
    authors: "M. A. Knolle, M. J. Menten, F. Jungmann, F. Meissen, B. Glocker, D. Rueckert, G. Kaissis",
    venue: "Nature",
    links: [{ label: "Paper", url: "https://www.nature.com/articles/s41586-026-10688-0" }],
    selected: true
  },
  {
    year: 2026,
    title: "Memorisation bias: AI predictions for data contributors are biased towards their health states in the training data",
    authors: "M. A. Knolle, et al.",
    venue: "MICCAI Workshop proceedings",
    links: [
      { label: "Chapter", url: "https://link.springer.com/chapter/10.1007/978-3-032-16128-4_3" },
      { label: "arXiv", url: "https://arxiv.org/abs/2609.17223" }
    ],
    selected: true
  },
  {
    year: 2026,
    title: "Addressing benchmarking gaps in large language models for health and medicine with dynamic red-teaming",
    authors: "J. Pan, B. Jian, P. Hager, Y. Zhang, C. Liu, F. Jungmann, H. B. Li, J. Canisius, … M. Knolle, … D. Rueckert",
    venue: "Nature Health",
    selected: true
  },
  {
    year: 2025,
    title: "Sensitivity, specificity, and consistency: a tripartite evaluation of privacy filters for synthetic data generation",
    authors: "A. Koeken, A. Ziller, M. Knolle, D. Rueckert",
    venue: "arXiv preprint",
    links: [{ label: "arXiv", url: "https://arxiv.org/abs/2510.01793" }]
  },
  {
    year: 2025,
    title: "Heterogeneity-driven phenotypic plasticity and treatment response in branched-organoid models of pancreatic ductal adenocarcinoma",
    authors: "A. Papargyriou, M. Najajreh, D. P. Cook, C. H. Maurer, S. Börthel, H. A. Messal, … M. Knolle, … M. Reichert",
    venue: "Nature Biomedical Engineering"
  },
  {
    year: 2024,
    title: "Memorisation in machine learning: a survey of results",
    authors: "D. Usynin, M. Knolle, G. Kaissis",
    venue: "Transactions on Machine Learning Research",
    selected: true
  },
  {
    year: 2024,
    title: "(Predictable) performance bias in unsupervised anomaly detection",
    authors: "F. Meissen, S. Breuer, M. Knolle, A. Buyx, R. Müller, G. Kaissis, B. Wiestler, D. Rueckert",
    venue: "eBioMedicine",
    selected: true
  },
  {
    year: 2024,
    title: "Visual privacy auditing with diffusion models",
    authors: "K. Schwethelm, J. Kaiser, M. Knolle, S. Lockfisch, D. Rueckert, A. Ziller",
    venue: "arXiv preprint",
    links: [{ label: "arXiv", url: "https://arxiv.org/abs/2403.07588" }]
  },
  {
    year: 2023,
    title: "Bias-aware minimisation: understanding and mitigating estimator bias in private SGD",
    authors: "M. Knolle, R. Dorfman, A. Ziller, D. Rueckert, G. Kaissis",
    venue: "arXiv preprint",
    links: [{ label: "arXiv", url: "https://arxiv.org/abs/2308.12018" }],
    selected: true
  },
  {
    year: 2023,
    title: "A distinct stimulatory cDC1 subpopulation amplifies CD8+ T cell responses in tumors for protective anti-cancer immunity",
    authors: "P. Meiser*, M. A. Knolle*, A. Hirschberger, G. P. de Almeida, F. Bayerl, … P. A. Knolle, G. Kaissis, J. P. Böttcher",
    venue: "Cancer Cell",
    links: [
      { label: "Paper", url: "https://www.cell.com/cancer-cell/fulltext/S1535-6108(23)00218-0" },
      { label: "Code", url: "https://github.com/moritzknolle/deepImmune3D" }
    ],
    selected: true
  },
  {
    year: 2023,
    title: "Tumor-derived prostaglandin E2 programs cDC1 dysfunction to impair intratumoral orchestration of anti-cancer T cell responses",
    authors: "F. Bayerl, P. Meiser, S. Donakonda, A. Hirschberger, S. B. Lacher, A.-M. Pedde, … M. Knolle, … J. P. Böttcher",
    venue: "Immunity"
  },
  {
    year: 2023,
    title: "Artificial intelligence and big data in cardiology: a practical guide — diagnosis",
    authors: "D. Rueckert, M. Knolle, N. Duchateau, R. Razavi, G. Kaissis",
    venue: "Book chapter, Springer Nature"
  },
  {
    year: 2022,
    title: "How do input attributes impact the privacy loss in differential privacy?",
    authors: "T. T. Mueller, S. Kolek, F. Jungmann, A. Ziller, D. Usynin, M. Knolle, D. Rueckert, G. Kaissis",
    venue: "arXiv preprint",
    links: [{ label: "arXiv", url: "https://arxiv.org/abs/2211.10173" }]
  },
  {
    year: 2021,
    title: "Efficient, high-performance semantic segmentation using multi-scale feature extraction",
    authors: "M. Knolle, G. Kaissis, F. Jungmann, S. Ziegelmayer, D. Sasse, M. Makowski, D. Rueckert, R. Braren",
    venue: "PLOS ONE",
    links: [{ label: "Paper", url: "https://doi.org/10.1371/journal.pone.0255397" }],
    selected: true
  },
  {
    year: 2021,
    title: "A unified interpretation of the Gaussian mechanism for differential privacy through the sensitivity index",
    authors: "G. Kaissis, M. Knolle, F. Jungmann, A. Ziller, D. Usynin, D. Rueckert",
    venue: "Journal of Privacy and Confidentiality",
    selected: true
  },
  {
    year: 2021,
    title: "Differentially private federated deep learning for multi-site medical image segmentation",
    authors: "A. Ziller, D. Usynin, N. Remerscheid, M. Knolle, M. Makowski, R. Braren, D. Rueckert, G. Kaissis",
    venue: "arXiv preprint",
    links: [{ label: "arXiv", url: "https://arxiv.org/abs/2107.02586" }]
  },
  {
    year: 2021,
    title: "Differentially private training of neural networks with Langevin dynamics for calibrated predictive uncertainty",
    authors: "M. Knolle, A. Ziller, D. Usynin, R. Braren, M. R. Makowski, D. Rueckert, G. Kaissis",
    venue: "ICML Workshop on Theory and Practice of Differential Privacy",
    links: [{ label: "arXiv", url: "https://arxiv.org/abs/2107.04296" }]
  },
  {
    year: 2021,
    title: "An automatic differentiation system for the age of differential privacy",
    authors: "D. Usynin, A. Ziller, M. Knolle, A. Trask, K. Prakash, D. Rueckert, G. Kaissis",
    venue: "arXiv preprint",
    links: [{ label: "arXiv", url: "https://arxiv.org/abs/2109.10573" }]
  },
  {
    year: 2021,
    title: "Partial sensitivity analysis in differential privacy",
    authors: "T. T. Mueller, A. Ziller, D. Usynin, M. Knolle, F. Jungmann, D. Rueckert, G. Kaissis",
    venue: "arXiv preprint",
    links: [{ label: "arXiv", url: "https://arxiv.org/abs/2109.10582" }]
  },
  {
    year: 2021,
    title: "Sensitivity analysis in differentially private machine learning using hybrid automatic differentiation",
    authors: "A. Ziller, D. Usynin, M. Knolle, K. Prakash, A. Trask, R. Braren, M. Makowski, D. Rueckert, G. Kaissis",
    venue: "arXiv preprint",
    links: [{ label: "arXiv", url: "https://arxiv.org/abs/2107.04265" }]
  },
  {
    year: 2021,
    title: "Complex-valued deep learning with differential privacy",
    authors: "A. Ziller, D. Usynin, M. Knolle, K. Hammernik, D. Rueckert, G. Kaissis",
    venue: "Preprint"
  }
];
