// src/data/profile.ts
// Single source of truth for personal details, links and page copy that appear in
// more than one place (nav, footer, hero, contact page, metadata).

export const profile = {
  name: 'Godliness Dongorere',
  firstName: 'Godliness',
  lastName: 'Dongorere',
  title: 'Health Data & AI Engineer',
  tagline: 'Software and systems engineer building AI-enabled health data tools, from CMIS decision support and Power BI dashboards to full-stack web apps and PLC systems.',
  shortBio: 'Health Data & AI Engineer | Software & Systems Engineer',
  location: 'Eswatini',
  availability: 'Open to new roles and projects',
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000'),
  email: 'godlinessdongorere@gmail.com',
  phone: '+268 7934 2380',
  phoneHref: 'tel:+26879342380',
  github: { label: 'github.com/geehyness', url: 'https://github.com/geehyness' },
  linkedin: { label: 'linkedin.com/in/gdongorere', url: 'https://linkedin.com/in/gdongorere' },
  resume: { url: '/Godliness_Dongorere_Resume_Systems.pdf', label: 'Download résumé (PDF)' },
} as const;

export interface NavItem {
  label: string;
  href: string;
}

export const navItems: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Projects', href: '/projects' },
  { label: 'About', href: '/#about' },
  { label: 'Stars', href: '/stars' },
  { label: 'Fly', href: '/fly' },
  { label: 'Contact', href: '/contact' },
];

export const skillGroups = [
  { category: 'Health Data & AI', items: ['CMIS', 'EMR systems', 'AI decision support', 'Ollama', 'Model Context Protocol (MCP)', 'Power BI', 'DAX', 'Apache Superset', 'Data privacy (PII reduction)'] },
  { category: 'Data & Cloud', items: ['SQL', 'Microsoft SQL Server', 'PostgreSQL', 'MongoDB', 'Microsoft Azure'] },
  { category: 'Languages', items: ['Python', 'C#', 'Java', 'C++', 'TypeScript / JavaScript'] },
  { category: 'Web & Frameworks', items: ['.NET Framework', 'AngularJS', 'Next.js', 'React', 'Node.js / Express', 'Chakra UI', 'OutSystems', 'API development'] },
  { category: 'Industrial & Automation', items: ['Siemens PLC (TIA Portal)', 'Profinet', 'SCADA Ignition'] },
  { category: '3D & Visualization', items: ['Three.js', '3D modelling', 'Prototyping', '3D printing'] },
  { category: 'Ways of working', items: ['Systems engineering', 'Architectural design', 'Git', 'Critical thinking', 'Project management', 'Teamwork'] },
] as const;

export const experience = [
  {
    company: 'Palladium: Make It Possible',
    position: 'Software Engineer',
    period: 'Feb 2026 – Sep 2026',
    achievements: [
      'Built an AI system in CMIS that identifies patients who have interrupted treatment, to prioritise follow-up',
      'Designed an AI assistant for the Power BI dashboards: an MCP tool turns users’ questions into DAX queries and returns processed results, so the model never has database access',
      'Returned aggregated, processed data only, keeping personally identifiable information out of AI responses',
      'Worked on the SQL Server data layer, APIs and architecture, with Azure, .NET, AngularJS and Apache Superset',
    ],
    tech: ['CMIS', 'Power BI', 'DAX', 'MCP', 'SQL Server', 'Azure'],
  },
  {
    company: 'Synapse Digital',
    position: 'Software Engineer',
    period: 'Jan 2025 – present',
    achievements: [
      'Build and ship full-stack web applications end to end',
      'Turn designs into responsive, accessible interfaces',
      'Integrate third-party APIs and payment/mapping services, and apply AI to analyse data and automate processes',
      'Manage projects and web design work from requirements to delivery',
    ],
    tech: ['Next.js', 'React', 'Node.js', 'TypeScript'],
  },
  {
    company: 'The Luke Commission, Sidvokodvo, eSwatini',
    position: 'Systems Engineer',
    period: 'May 2023 – Sep 2025',
    achievements: [
      'Managed critical healthcare systems, including EMR integrations with medical devices and dashboards',
      'Designed an Oxygen Plant dashboard (SCADA Ignition) that improved product-gas quality monitoring',
      'Programmed Siemens PLCs in TIA Portal and integrated Profinet slaves',
      'Built OutSystems applications for organisational processes',
      'Created custom 3D-printed solutions for hospital IT settings',
    ],
    tech: ['EMR', 'SCADA Ignition', 'TIA Portal', 'OutSystems', '3D printing'],
  },
  {
    company: 'YukiSoft',
    position: 'Freelance Android Developer',
    period: 'Freelance',
    achievements: ['Developed Android applications as a freelance developer'],
    tech: ['Android Studio'],
  },
  {
    company: 'Ka-Zakhali Private School',
    position: 'Technical Support Specialist',
    period: 'Mar 2022 – Dec 2022',
    achievements: [
      'Developed a custom reporting system for school reports',
      'Provided ICT support to staff and students',
      'Taught Computer Application Technology to Grade 9–12 students',
    ],
    tech: ['ICT support', 'Teaching'],
  },
] as const;

export const interests = [
  'Health data and AI (local LLMs, decision support)',
  'Open-source software',
  'Healthcare innovation and digital health',
  '3D visualization and prototyping',
] as const;
