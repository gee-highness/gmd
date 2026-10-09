// /data/projectsData.ts
export type ProjectLink = {
    label: string;
    url: string;
    note?: string;
};

export type Project = {
    id: string;
    name: string;
    shortDescription?: string;
    longDescription?: string;
    tech?: string[];
    links?: ProjectLink[];
    credentials?: { username?: string; password?: string; note?: string } | null;
    year?: number;
    role?: string;
    repo?: string;
    screenshotAlt?: string;
    category?: "ecommerce" | "management" | "education" | "productivity" | "utility" | "game" | "design" | "enterprise" | "marketplace" | "industrial";
    featured?: boolean;
    metrics?: Record<string, string>;
};

export const projectsData: Project[] = [
    // FEATURED PROJECTS
    {
        id: 'cmis-ai-decision-support',
        name: 'CMIS AI Decision Support',
        shortDescription: 'AI system in CMIS that identifies interrupted-in-treatment patients, with a privacy-preserving AI assistant for Power BI dashboards.',
        longDescription: `AI decision support built for a client-management health information system (CMIS) at Palladium: Make It Possible.

Key Features:
• Interrupted-in-treatment: an AI system that identifies patients who have interrupted treatment so follow-up can be prioritised
• Dashboard assistant: an AI model accompanies the Power BI dashboards and answers users' questions
• MCP + DAX: the assistant reads data through a Model Context Protocol tool that generates DAX queries from the question and returns matching results
• No database access: the model never connects to the database, only to the query tool
• Privacy by design: processed, aggregated data is returned so personally identifiable information stays out of responses`,
        tech: ['CMIS', 'Power BI', 'DAX', 'MCP', 'SQL Server', 'AI'],
        year: 2026,
        role: 'Software Engineer',
        screenshotAlt: 'Architecture of the CMIS AI decision support system',
        category: 'enterprise',
        featured: true
    },
    {
        id: 'venda-khona',
        name: 'Venda Khona',
        shortDescription: 'Complete marketplace platform for Eswatini with buyer/seller tools and offline mode.',
        longDescription: `Venda Khona is a comprehensive digital marketplace designed specifically for Eswatini and Southern Africa. The platform addresses regional challenges including intermittent connectivity with an offline-first architecture, location-based services, and dual interfaces for buyers and sellers.

Key Features:
• Offline Browsing: Cache-first design works without internet
• Location Intelligence: Smart filtering by region, city, and interactive maps
• Shop Customization: Brandable storefronts with blogs and promotions
• Built-in Messaging: Secure chat between buyers and sellers
• Service Booking: Time slot scheduling for service providers
• Comparison Tools: Side-by-side product comparison with favorites system
• Seller Dashboard: Complete order management, analytics, and inventory tracking

The platform supports both product sales and service bookings with negotiable pricing, and integrates with local payment preferences.`,
        tech: ['Next.js', 'React', 'Node.js', 'MongoDB', 'Redis', 'Mapbox', 'Chakra UI', 'Vercel', 'Service Workers'],
        links: [
            { label: 'Marketplace', url: 'https://venda-khona.vercel.app' },
        ],
        year: 2024,
        role: 'Full-stack Developer & Product Designer',
        screenshotAlt: 'Venda Khona marketplace with shop listings',
        category: 'ecommerce',
        featured: true,
        metrics: {
            platforms: 'Buyer + Seller interfaces',
            offline: 'Cache-first architecture',
            features: 'Maps, chat, booking system'
        }
    },
    {
        id: 'agtfieldcore',
        name: 'AGT FieldCore',
        shortDescription: 'Offline-first PWA for construction field management with edge AI and digital accountability.',
        longDescription: `AGT FieldCore is a bespoke digital field management system designed for AG Thomas construction sites. Built as an "Offline-First" Progressive Web App (PWA), it operates seamlessly in areas with poor connectivity, automatically syncing data when connection is restored.

Key Features:
• Edge AI Intelligence: TensorFlow.js runs locally for photo analysis, hazard detection, and voice input
• Digital Accountability: Every action logged with digital signatures for safety compliance
• QR Code Asset Tracking: Equipment management with check-in/out system
• Project Health Analytics: AI-powered scoring for schedule, budget, safety, and team performance
• Photo Progress Analysis: Computer vision compares before/after photos to estimate completion
• Dual Storage: LocalStorage + Sanity.io for maximum reliability

The system includes modules for field logs, asset tracking, safety compliance, project management, and predictive analytics.`,
        tech: ['React PWA', 'TypeScript', 'TensorFlow.js', 'Sanity.io', 'Service Workers', 'Chakra UI', 'Vercel'],
        links: [
            { label: 'Live Application', url: 'https://agtfieldcore.vercel.app', note: 'Production v1.0' }
        ],
        credentials: { username: 'field_operator', password: 'demo@agt123', note: 'Use "project_manager" for admin features' },
        year: 2024,
        role: 'Lead Developer & System Architect',
        screenshotAlt: 'AGT FieldCore field management dashboard',
        category: 'enterprise',
        featured: true,
        metrics: {
            users: '50+ field operators',
            performance: '98% offline capability',
            architecture: 'Edge AI + PWA'
        }
    },
    {
        id: 'nexacore-solutions',
        name: 'NexaCore Solutions',
        shortDescription: 'Complete business ecosystem with services marketplace, digital products, and SADC business network.',
        longDescription: `NexaCore Solutions is a comprehensive business platform serving Southern Africa, featuring multiple integrated components:

Platform Components:
• Services Marketplace: Professional services booking (fabrication, development, design, marketing)
• Digital Products Store: SaaS tools for businesses (CRM, project management, analytics)
• Business Network: Verified SADC business directory with collaboration tools
• SADC Business Wire: Regional news platform with market intelligence
• PWA Capability: Installable as native app on mobile devices

Key Features:
• Role-Based Access: Single login with customer, staff, and admin portals
• Service Booking: One-stop shop for business services with instant booking
• Business Verification: Trust badges and verification system
• Interactive Network Feed: Live updates and connection requests
• Regional Coverage: Business listings across SADC countries`,
        tech: ['Next.js PWA', 'TypeScript', 'React', 'MongoDB', 'Stripe', 'Mapbox', 'Chakra UI', 'Vercel'],
        links: [
            { label: 'SADC Business Wire', url: 'https://nexa-solutions.africa/#/news', note: 'Regional business news' },
            { label: 'Main Platform', url: 'https://nexa-solutions.africa', note: 'Complete ecosystem' }
        ],
        credentials: { note: 'Use role switcher in demo to access: Customer, Staff, Admin portals' },
        year: 2024,
        role: 'Lead Full-stack Developer & Platform Architect',
        screenshotAlt: 'NexaCore business platform with services and network',
        category: 'marketplace',
        featured: true,
        metrics: {
            components: '4 integrated portals',
            regions: 'SADC business network',
            services: 'Digital products + marketplace'
        }
    },
    {
        id: 'ecot-system',
        name: 'ECOT - University Management',
        shortDescription: 'Complete university management platform with role-based portals in single application.',
        longDescription: `The Eswatini College of Technology (ECOT) Management System is an all-in-one university platform featuring:

System Architecture:
• Single Application: All portals (student, teacher, admin, public) in one codebase
• Role Switcher: Demo feature to switch between user roles instantly
• Public Website: Marketing site with 21+ technical programs, virtual tours, news
• Student Portal: Academic dashboard, courses, grades, finances, hostel, cafeteria
• Teacher Portal: Course management, lesson planner, assignments, communication
• Admin Portal: Complete university administration, analytics, system management

Demonstrates complex role-based UI, academic workflow automation, and multi-tenant architecture in a single cohesive application.`,
        tech: ['Next.js', 'TypeScript', 'PostgreSQL', 'Prisma', 'JWT', 'Chakra UI', 'Vercel'],
        links: [
            { label: 'Live Demo', url: 'https://ecot-demo.vercel.app', note: 'All portals in one - use role switcher' }
        ],
        credentials: { note: 'Switch between: Student, Teacher, Admin roles in application' },
        year: 2024,
        role: 'Lead Full-Stack Developer & System Architect',
        screenshotAlt: 'ECOT university management system dashboard',
        category: 'education',
        featured: true,
        metrics: {
            roles: '4 user portals in one',
            programs: '21+ technical diploma programs',
            modules: 'Complete academic management'
        }
    },

    // MANAGEMENT & PRODUCTIVITY
    {
        id: 'caterflow-synapse',
        name: 'Caterflow by Synapse',
        shortDescription: 'Catering management system with inventory, ordering, and integrated Sanity.io CMS.',
        longDescription: `Caterflow is a specialized catering management platform featuring end-to-end workflow from menu planning to delivery:

Core Features:
• Inventory Intelligence: Real-time stock tracking with automated alerts
• Menu Management: Dynamic menu builder with seasonal adjustments
• Order Workflow: Complete order lifecycle from inquiry to delivery
• Integrated CMS: Sanity.io for flexible content management
• Supplier Integration: Vendor management and purchase order automation
• Central Portal: Unified access hub for application, docs, and CMS

The system includes a main application for operations, Sanity dashboard for content management, and comprehensive user documentation.`,
        tech: ['Next.js', 'TypeScript', 'Sanity.io', 'PostgreSQL', 'React', 'Chakra UI'],

        credentials: { note: 'Private deployment - no public access available' },
        year: 2023,
        role: 'Full-stack Developer & System Architect',
        screenshotAlt: 'Caterflow inventory management system',
        category: 'management',
        featured: false
    },
    {
        id: 'triptych-tasks',
        name: 'Triptych Tasks',
        shortDescription: 'Advanced task management with team collaboration, time tracking, and project analytics.',
        longDescription: `Triptych Tasks is a sophisticated project management platform for teams requiring detailed tracking and collaboration:

Features:
• Smart Task Management: Hierarchical tasks with dependencies and custom workflows
• Team Collaboration: Real-time updates, comments, file attachments, and @mentions
• Time Tracking: Manual and automatic time logging with productivity analytics
• Project Analytics: Burn-down charts, velocity tracking, and resource allocation
• Custom Views: Kanban boards, Gantt charts, calendar views, and list views
• AI-Powered Suggestions: Smart task assignment and deadline predictions
• Integration Ready: Webhook support for connecting with other tools`,
        tech: ['React', 'TypeScript', 'Node.js', 'MongoDB', 'Socket.io', 'D3.js', 'Chakra UI', 'Vercel'],
        links: [
            { label: 'Live Application', url: 'https://triptych-tasks.vercel.app' }
        ],
        credentials: { username: 'demo@triptych.com', password: 'taskmanager2024', note: 'Team lead role with sample projects' },
        year: 2024,
        role: 'Full-stack Developer',
        repo: 'https://github.com/geehyness/triptych-tasks',
        screenshotAlt: 'Triptych Tasks project management dashboard',
        category: 'productivity',
        featured: false
    },
    {
        id: 'doctrack-pro',
        name: 'Doctrack Pro',
        shortDescription: 'Enterprise document management with version control, workflow automation, and compliance tracking.',
        longDescription: `Doctrack Pro is a comprehensive document management system for organizations requiring strict version control and regulatory compliance:

Key Capabilities:
• Version Control: Full document history with diff comparison and rollback
• Workflow Automation: Custom approval chains with electronic signatures
• Compliance Tracking: Automated retention schedules and audit logging
• Advanced Search: OCR-powered full-text search across all document types
• Access Control: Granular permissions at folder and document levels
• Collaboration Tools: Comments, annotations, and real-time co-editing
• Reporting: Usage analytics, storage metrics, and compliance reports

The system supports multiple file types, includes built-in OCR for scanned documents, and offers comprehensive audit trails.`,
        tech: ['Next.js', 'TypeScript', 'PostgreSQL', 'Prisma', 'AWS S3', 'Tesseract.js', 'PDF.js', 'Chakra UI'],
        links: [
            { label: 'Live Demo', url: 'https://doctrack-pro.vercel.app' },
            { label: 'TS Version', url: 'https://doctrack-ts.vercel.app', note: 'TypeScript rewrite' }
        ],
        credentials: { username: 'admin@doctrack.demo', password: 'secureDoc2024!', note: 'Administrator with sample documents' },
        year: 2024,
        role: 'Full-stack Developer',
        repo: 'https://github.com/geehyness/doctrack-pro',
        screenshotAlt: 'Doctrack Pro document management interface',
        category: 'management',
        featured: false
    },
    {
        id: 'ndou-africa',
        name: 'Ndou Africa Group',
        shortDescription: 'Investment platform with separate customer and management portals.',
        longDescription: `Ndou Africa Group platform featuring two specialized deployments for investment management:

Deployments:
• Customer Portal: Public-facing investment platform for clients to view opportunities, track investments, and access resources
• Management Portal: Internal administration for managing investments, clients, reporting, and operations

Features secure separation of concerns with dedicated interfaces for different user types, financial data management, and investment tracking workflows.`,
        tech: ['Next.js', 'TypeScript', 'PostgreSQL', 'Prisma', 'Financial APIs', 'Chakra UI', 'Vercel'],
        links: [
            { label: 'Customer Portal', url: 'https://ndou-invest.vercel.app', note: 'Public investor platform' },
            { label: 'Management Portal', url: 'https://ndou-management.vercel.app', note: 'Internal administration' }
        ],
        credentials: { note: 'Separate deployments for customers vs management' },
        year: 2024,
        role: 'Full-stack Developer',
        repo: 'https://github.com/geehyness/ndou',
        screenshotAlt: 'Ndou Africa investment platform',
        category: 'management',
        featured: false
    },
    {
        id: 'dixies-system',
        name: 'Dixies Management',
        shortDescription: 'Business management platform with separate customer and management interfaces.',
        longDescription: `Complete business management system with two distinct deployments:

Deployments:
• Customer-Facing Portal: Client interface for service access, booking, and support
• Management Portal: Internal operations for service management, analytics, and administration

Features role-specific interfaces, service management workflows, and operational analytics for business efficiency.`,
        tech: ['Next.js', 'TypeScript', 'PostgreSQL', 'Prisma', 'Service Management', 'Chakra UI', 'Vercel'],
        links: [
            { label: 'Customer Portal', url: 'https://dixies-sz.vercel.app', note: 'Client-facing interface' },
            { label: 'Management Portal', url: 'https://dixies-mgmt.vercel.app', note: 'Internal administration' }
        ],
        year: 2024,
        role: 'Full-stack Developer',
        repo: 'https://github.com/geehyness/dixies-sz',
        screenshotAlt: 'Dixies management system dashboard',
        category: 'management',
        featured: false
    },

    // WEB APPS & UTILITIES
    {
        id: 'bible-reader',
        name: 'Bible Reader PWA',
        shortDescription: 'Progressive web app for scripture reading with offline access and study tools.',
        longDescription: `Modern Bible reading PWA designed for areas with limited connectivity:

Features:
• Offline-First Design: Downloads selected books/translations for offline access
• Multiple Translations: Parallel reading with KJV, NIV, ESV, and local translations
• Study Tools: Highlighting, notes, bookmarks, and reading plans
• Audio Narration: Text-to-speech in multiple languages
• Reading Analytics: Track reading habits and progress
• Shareable Notes: Export highlights and notes as PDF or text
• Minimal Data Usage: Optimized for low-bandwidth environments

The app uses service workers for background syncing and IndexedDB for local storage of user data.`,
        tech: ['PWA', 'React', 'IndexedDB', 'Service Workers', 'Web Audio API', 'Chakra UI', 'Vercel'],
        links: [
            { label: 'Live App', url: 'https://bible-reader-omega.vercel.app' }
        ],
        credentials: { note: 'No login required - all features available immediately' },
        year: 2024,
        role: 'Solo Developer & Designer',
        repo: 'https://github.com/geehyness/bible-reader',
        screenshotAlt: 'Bible Reader PWA with scripture text',
        category: 'utility',
        featured: false
    },
    {
        id: 'ludo-kingdom',
        name: 'Ludo Kingdom',
        shortDescription: 'Multiplayer Ludo game platform with real-time gameplay, chat, and tournaments.',
        longDescription: `Digital Ludo platform with full multiplayer capabilities and social features:

Features:
• Real-time Multiplayer: Play with friends or match with players worldwide
• Tournament System: Organized competitions with brackets and prizes
• Social Features: Friends lists, chat, emojis, and player profiles
• Game Customization: Different rule sets, board designs, and game modes
• Statistics Tracking: Win/loss records, ranking points, and achievement system
• Cross-platform: Play on web and mobile with synchronized progress
• Spectator Mode: Watch ongoing games and learn from top players
• Anti-cheat: Server-side validation to ensure fair play`,
        tech: ['React', 'Node.js', 'Socket.io', 'Redis', 'Canvas API', 'Chakra UI', 'Vercel'],
        links: [
            { label: 'Play Now', url: 'https://ludo-kingdom.vercel.app' },
            { label: 'Sync Service', url: 'https://ludo-sync.vercel.app', note: 'Game state synchronization' }
        ],
        credentials: { note: 'Guest play or create account for ranked matches' },
        year: 2024,
        role: 'Game Developer & Full-stack Engineer',
        repo: 'https://github.com/geehyness/ludo-kingdom',
        screenshotAlt: 'Ludo Kingdom game board',
        category: 'game',
        featured: false
    },

    // YOUR EXISTING PROJECTS
    {
        id: 'chairapp',
        name: 'The Chair App',
        shortDescription: 'A modern barbershop booking platform with multi-barber scheduling.',
        longDescription: 'The Chair App is a full-featured booking and management platform designed for barbershops. It includes real-time appointment scheduling, staff dashboards for managing multiple barbers and their skills, and a customer-facing site for easy booking. Built with Next.js App Router, Sanity.io, and Chakra UI.',
        tech: ['Next.js', 'Sanity', 'TypeScript', 'Chakra UI', 'Postgres'],
        links: [
            { label: 'Customer site', url: 'https://the-chair-app.vercel.app/' },
            { label: 'Admin dashboard', url: 'https://the-chair-app.vercel.app/admin', note: 'Login required' },
        ],
        credentials: { username: 'admin@thechairapp', password: 'TheChairAppAdmin!', note: 'Reset every 24h' },
        year: 2024,
        role: 'Lead developer',
        repo: 'https://github.com/geehyness/the-chair-app',
        screenshotAlt: 'The Chair App',
        category: 'management',
        featured: false
    },
    {
        id: 'kimmys',
        name: 'Kimmy\'s Food Orders',
        shortDescription: 'A modern restaurant POS built with Next.js and Sanity.',
        longDescription: 'Kimmy\'s is a full-featured point-of-sale system: real-time menu management and staff dashboards. Built with Next.js App Router, Sanity.io, and Chakra UI.',
        tech: ['Next.js', 'Sanity', 'TypeScript', 'Chakra UI', 'Postgres'],
        links: [
            { label: 'Customer site', url: 'https://kimmys.vercel.app/' },
        ],
        credentials: null,
        year: 2024,
        role: 'Lead developer',
        repo: 'https://github.com/geehyness/kimmys-site/',
        screenshotAlt: 'Kimmy\'s homepage with menu and order modal',
        category: 'management',
        featured: false
    },
    {
        id: 'house-viewer',
        name: '3D House Viewer',
        shortDescription: 'An interactive 3D house explorer using Three.js and Cannon.js.',
        longDescription: 'A walkable, physics-enabled 3D house viewer with day-night cycle, mobile joystick controls and model collision. Great for showcasing frontend and real-time interaction skills.',
        tech: ['Three.js', 'Cannon.js', 'React', 'TypeScript'],
        links: [{ label: 'Live demo', url: '/house-viewer' }],
        credentials: null,
        year: 2024,
        role: 'Frontend engineer',
        repo: 'https://github.com/geehyness/gmd/tree/main/src/app/house-viewer',
        screenshotAlt: '3D house viewer scene with sunlight and UI',
        category: 'utility',
        featured: false
    },

    // ADDITIONAL PROJECTS
    {
        id: 'branding-design',
        name: 'Brand Design Management',
        shortDescription: 'Comprehensive brand asset management system for agencies and design teams.',
        longDescription: `Complete brand management platform centralizing all brand assets and guidelines:

Features:
• Asset Library: Central repository for logos, colors, fonts, and templates
• Brand Guidelines: Interactive style guides with live examples
• Project Management: Design briefs, approvals, and revision tracking
• Collaboration Tools: Client feedback, annotations, and version comparison
• Export System: Automated asset exports in multiple formats and sizes
• Integration: Connections with design tools (Figma, Adobe Creative Cloud)`,
        tech: ['Next.js', 'TypeScript', 'PostgreSQL', 'Cloudinary', 'Figma API', 'Chakra UI', 'Vercel'],
        links: [
            { label: 'Management Portal', url: 'https://branding-design-mgmt.vercel.app' },
            { label: 'Client Portal', url: 'https://branding-design-ruby.vercel.app' }
        ],
        year: 2024,
        role: 'Full-stack Developer & UI Designer',
        repo: 'https://github.com/geehyness/branding-design',
        screenshotAlt: 'Brand design management dashboard',
        category: 'design',
        featured: false
    },
    {
        id: 'synapse-digital',
        name: 'Synapse Digital',
        shortDescription: 'Digital agency showcase with portfolio, services, and client project management.',
        longDescription: `Professional digital agency website showcasing services, portfolio, and client work:

Features:
• Interactive Project Galleries: Case studies with detailed breakdowns
• Service Descriptions: Comprehensive service offerings with pricing
• Client Testimonials: Verified reviews and success stories
• Project Inquiry System: Contact forms with project requirements
• Blog/Content Management: Industry insights and updates
• Performance Optimized: Fast loading, SEO-friendly structure`,
        tech: ['Next.js', 'TypeScript', 'Sanity.io', 'Framer Motion', 'Tailwind CSS', 'Vercel'],
        links: [
            { label: 'Live Website', url: 'https://synapse-digital.vercel.app' }
        ],
        year: 2024,
        role: 'Frontend Developer & Designer',
        repo: 'https://github.com/geehyness/synapse-digital',
        screenshotAlt: 'Synapse Digital agency website',
        category: 'design',
        featured: false
    },
    {
        id: 'school-template',
        name: 'School Management Template',
        shortDescription: 'Modular template for educational institutions with customizable components.',
        longDescription: `Reusable template system for educational institutions:

Features:
• Modular Architecture: Pluggable components for different school types
• Customizable Themes: Branding options and color schemes
• Pre-built Pages: Home, courses, faculty, admissions, contact
• Admin Dashboard Framework: Ready-to-extend management interface
• Documentation: Comprehensive customization guide
• Responsive Design: Mobile-optimized across all pages`,
        tech: ['Next.js', 'TypeScript', 'Tailwind CSS', 'Component Library', 'Storybook', 'Vercel'],
        links: [
            { label: 'Demo', url: 'https://ecot-demo.vercel.app' }
        ],
        year: 2024,
        role: 'Template Developer & Designer',
        repo: 'https://github.com/geehyness/school-template',
        screenshotAlt: 'School management template homepage',
        category: 'education',
        featured: false
    }
];
