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
        id: 'servo-pos',
        name: 'Servo POS',
        shortDescription: 'Multi-tenant restaurant point of sale for Eswatini: till, kitchen screen, table QR ordering, stock and sales reports in the browser.',
        longDescription: `Servo POS is a multi-tenant restaurant point of sale built for Eswatini, priced in Lilangeni (E). One Next.js 15 PWA serves every role, in front of a FastAPI + MongoDB API.

Key Features:
• POS till: fast order entry for tables and takeaway, cash recorded at the till
• Kitchen screen: orders flow from new to preparing to ready in real time
• Customer self-checkout: table QR ordering straight from the guest's phone
• Management: menu, stock, staff and sales reports per restaurant
• Card payments through DeltaCrypt, paid straight into each restaurant's own account
• Platform admin: a separate support console for onboarding and managing restaurants
• Live demo restaurant: try every screen without signing up`,
        tech: ['Next.js 15', 'React', 'TypeScript', 'PWA', 'FastAPI', 'Python', 'MongoDB', 'Vercel'],
        links: [
            { label: 'Website', url: 'https://servo-pos.vercel.app/' },
            { label: 'Live demo', url: 'https://servo-pos.vercel.app/#demo', note: 'No sign-up needed' }
        ],
        year: 2026,
        role: 'Founder & Full-stack Developer',
        screenshotAlt: 'Servo POS landing page with live order cards',
        category: 'management',
        featured: true,
        metrics: {
            apps: 'Till, kitchen, management, QR ordering, admin',
            payments: 'DeltaCrypt cards + cash',
            tenancy: 'Multi-restaurant'
        }
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
        tech: ['React 18', 'Vite', 'TypeScript', 'Express', 'MongoDB Atlas', 'Vercel Blob', 'PWA', 'Vercel'],
        links: [
            { label: 'Marketplace', url: 'https://vendakhona.vercel.app/' },
            { label: 'Demo shops', url: 'https://vendakhona.vercel.app/app/#/demo', note: 'See how shops look' },
        ],
        year: 2026,
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
        id: 'gss-lms',
        name: 'GSS-LMS',
        shortDescription: 'Multi-school learning management platform: each school gets its own portal for applications, courses, grades, attendance and fees.',
        longDescription: `GSS-LMS is a multi-tenant learning management system by G-Solutions². Every school on the platform has its own address and branding, and students find their school by name from the GSS-LMS front door.

Key Features:
• Online applications: prospective students apply from the school's public site
• Student portal: courses, grades, attendance and fees in one place
• Per-school branding: each institution runs on its own portal and domain
• Live schools: Mananga Business School and Nova Global Academy run on the platform`,
        tech: ['React', 'TypeScript', 'Multi-tenant', 'Vercel'],
        links: [
            { label: 'GSS-LMS', url: 'https://gss-lms.vercel.app/', note: 'Find your school' },
            { label: 'Mananga Business School', url: 'https://mananga-lms.vercel.app/', note: 'School portal on GSS-LMS' }
        ],
        year: 2026,
        role: 'Lead Developer',
        screenshotAlt: 'Mananga Business School portal running on GSS-LMS',
        category: 'education',
        featured: true
    },
    {
        id: 'v-me',
        name: 'V-Me',
        shortDescription: 'A free, offline life game with a talking character, an open-plan home and a whole town, plus a film studio and avatar creator.',
        longDescription: `V-Me is a life game, a film studio and an avatar creator in one free app. Live in a big open-plan home and a town full of people, with a character who talks, looks after themselves and chases goals. Play it your way, then turn any moment into a video.

Key Features:
• Talking character with its own voice service
• Whole town and people to talk to, sandbox play
• Film studio: turn any moment into a video
• Avatar creator
• Controller, touch and keyboard; dark and light mode
• Works offline on Android, Windows, Linux and macOS`,
        tech: ['3D', 'Game development', 'Cross-platform', 'Voice', 'Vercel'],
        links: [
            { label: 'Download', url: 'https://getvme.vercel.app/', note: 'Android, Windows, Linux, macOS' }
        ],
        year: 2026,
        role: 'Creator & Developer',
        screenshotAlt: 'V-Me download page with an in-game home scene',
        category: 'game',
        featured: true
    },
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
        id: 'g-solutions',
        name: 'G-Solutions²',
        shortDescription: 'Business management system with a customer-facing portal and an internal staff dashboard.',
        longDescription: `G-Solutions² is a business management system for G-Solutions²: a customer-facing site for services, products, community and news, and an internal staff dashboard.

Key Features:
• Customer portal: services, products, shop, community and blog
• Staff dashboard: financial tracking, operations, content and user management
• Staff engagement: daily briefing with login bonuses and work streaks
• Installable, mobile-first navigation`,
        tech: ['React', 'TypeScript', 'Vite', 'Vercel'],
        links: [
            { label: 'Live website', url: 'https://gss-sz.vercel.app/' }
        ],
        year: 2026,
        role: 'Founder & Developer',
        screenshotAlt: 'G-Solutions² customer site home page',
        category: 'management',
        featured: false
    },
    {
        id: 'shesha',
        name: 'SHESHA',
        shortDescription: "Open-world racing game set on Eswatini's MR3 corridor, built with Angular and three.js, playable offline and packaged for desktop and Android.",
        longDescription: `SHESHA (siSwati for "go fast") is an open-world racing game set on Eswatini's MR3 road corridor, with the Hub of Eswatini as its starting point.

Key Features:
• Real places: a world prepared from OpenStreetMap and elevation data with a Blender pipeline
• Real assets: CC0 textures and sky from Poly Haven, plus procedural road markings, signage, shop banners and vehicles
• Looks: a clean full-resolution render, with an optional chunky retro look toggled in game
• Controls: keyboard throttle, steer and handbrake, with camera, map and photo modes
• Works offline: installable PWA with a service worker, plus Linux (AppImage, pacman) and Windows builds through Electron
• Release automation: a GitHub workflow builds and attaches the downloads`,
        tech: ['Angular 21', 'three.js', 'TypeScript', 'Electron', 'Capacitor', 'PWA', 'OpenStreetMap', 'Blender'],
        links: [
            { label: 'Source code', url: 'https://github.com/gee-highness/shesha' }
        ],
        year: 2026,
        role: 'Game Developer',
        repo: 'https://github.com/gee-highness/shesha',
        screenshotAlt: 'SHESHA title screen over a 3D road scene in Eswatini',
        category: 'game',
        featured: false
    },
    {
        id: 'jarvis-assistant',
        name: 'J.A.R.V.I.S. Assistant',
        shortDescription: 'Offline productivity assistant for Android with a fast, language-model-free "reflex brain", memory, voice and gamified habits.',
        longDescription: `J.A.R.V.I.S. is an offline productivity assistant for Android. Its default "reflex brain" uses no language model at all, so replies arrive in milliseconds, work without internet and keep your data on the phone.

Key Features:
• Reflex brain: TF-IDF matching over 114 skills and hundreds of phrasings, with follow-ups and pronoun handling
• Acts on your behalf: tasks, reminders, alarms, timers, focus sessions, habits, goals, journal, mood, notes and calendar
• Memory: learns facts you tell it and recalls them later
• Voice, home-screen widgets and a persona with adjustable personality sliders
• Progress: XP, levels, streaks and daily quests
• Optional on-device language model for open conversation
• Tested headless with scripts, no Angular needed`,
        tech: ['Angular 20', 'Capacitor', 'TypeScript', 'Android', 'Offline-first', 'NLP (TF-IDF)'],
        links: [
            { label: 'Download APK', url: 'https://github.com/gee-highness/jarvis-assistant/releases/latest', note: 'GitHub Releases' },
            { label: 'Source code', url: 'https://github.com/gee-highness/jarvis-assistant' }
        ],
        year: 2026,
        role: 'Creator & Developer',
        repo: 'https://github.com/gee-highness/jarvis-assistant',
        screenshotAlt: 'J.A.R.V.I.S. morning briefing screen on Android',
        category: 'productivity',
        featured: false
    },
    {
        id: 'fleetflow',
        name: 'FleetFlow Logistics',
        shortDescription: 'Multi-tenant trucking logistics platform for Southern Africa: fleet dashboard, trips, driver tablet app and offline-first storage.',
        longDescription: `FleetFlow is a multi-tenant logistics SaaS for the Eswatini and Southern African trucking market, built as an installable PWA that can also be wrapped as an Android app.

Key Features:
• Admin portal: live fleet map, trip scheduling, drivers, vehicles, geofences, reports and analytics
• Driver tablet app: PIN login, digital pre-trip inspections, live trip tracking and electronic proof of delivery (ePOD)
• Super admin panel: platform-wide monitoring, tenant management and system health
• Multi-tenant: each logistics company's data is isolated
• Offline-first: IndexedDB storage keeps the app working with poor connectivity
• Maps with Leaflet and OpenStreetMap`,
        tech: ['Angular 21', 'TypeScript', 'Tailwind CSS 4', 'IndexedDB', 'Leaflet', 'Capacitor', 'PWA'],
        year: 2026,
        role: 'Full-stack Developer',
        screenshotAlt: 'FleetFlow admin dashboard with trips chart and fleet stats',
        category: 'enterprise',
        featured: false
    },
    {
        id: 'eswatini-health-api',
        name: 'Eswatini Health Indicators API',
        shortDescription: 'Secured ASP.NET Core REST API with scheduled SQL Server ETL services that feed national health indicator dashboards.',
        longDescription: `A .NET 9 REST API that gives dashboards a secure, consistent source for national health indicators, backed by scheduled ETL services that load programme data from source tables into a staging database.

Key Features:
• ETL services: three scheduled pipelines for HIV testing (HTS), PrEP and ART treatment outcomes, with batch IDs and de-duplication
• Indicators API: indicators, regions, targets and dashboard endpoints
• Security: JWT authentication, API-key protected ETL triggers, BCrypt password hashing, an encryption service and rate limiting
• Operations: structured logging with Serilog, health checks and OpenAPI / Swagger documentation
• Data: SQL Server through Entity Framework Core and Dapper, with SQL scripts, views and verification queries`,
        tech: ['ASP.NET Core', '.NET 9', 'C#', 'SQL Server', 'Entity Framework Core', 'Dapper', 'JWT', 'Serilog', 'OpenAPI'],
        year: 2026,
        role: 'Backend Developer',
        screenshotAlt: 'Architecture of the Eswatini Health Indicators API and ETL services',
        category: 'enterprise',
        featured: false
    },
    {
        id: 'carte-pos',
        name: 'Carte POS & Payments API',
        shortDescription: 'Restaurant POS backend with orders, inventory, HR and payroll, and PayFast payments, built in FastAPI and Laravel.',
        longDescription: `Backend services for Carte, a point-of-sale system for independent restaurants. A FastAPI and MongoDB API with about 97 endpoints covers the whole restaurant, and an earlier Laravel 12 backend explored the same domain.

Key Features:
• POS: foods, orders, products, customers and tables
• HR: employees, shifts, timesheets and payroll
• Inventory management
• Authentication and authorization with JWT / OAuth2 bearer tokens
• Payments: PayFast ITN integration with signature verification and server-side validation of payment notifications
• Interactive OpenAPI documentation`,
        tech: ['FastAPI', 'Python', 'MongoDB', 'Laravel 12', 'PHP', 'PayFast', 'JWT', 'OpenAPI'],
        year: 2025,
        role: 'Backend Developer',
        screenshotAlt: 'Swagger documentation of the POS System API',
        category: 'management',
        featured: false
    },
    {
        id: 'gatetrack-secure',
        name: 'GateTrack Secure',
        shortDescription: 'Gate and asset management PWA with QR scanning, visitor badges and an offline sync queue, branded for Ubombo Sugar, Eswatini.',
        longDescription: `GateTrack Secure is a role-based Progressive Web App for gate officers, asset managers and administrators, branded for Ubombo Sugar in Eswatini.

Key Features:
• Roles: administrator, gate officers (with gate selection) and asset manager dashboards
• Visitors: registration forms, QR scanning, verification panel and printable visitor badges
• Assets: assignment and transfer between people and locations
• Live log of gate activity
• Offline-first: a sync queue keeps working without a connection and uploads when back online
• Installable on phones, with an iOS install guide`,
        tech: ['React', 'TypeScript', 'Vite', 'PWA', 'QR scanning', 'Service Workers'],
        year: 2026,
        role: 'Full-stack Developer',
        screenshotAlt: 'GateTrack Secure login screen for Ubombo Sugar',
        category: 'enterprise',
        featured: false
    },
    {
        id: 'dialysis-support-core',
        name: 'Dialysis Support Core',
        shortDescription: 'Offline-first PWA for dialysis patients: deterministic symptom triage and home-care recommendations.',
        longDescription: `Dialysis Support Core helps people on dialysis assess symptoms and follow home-care advice, even without internet.

Key Features:
• Triage wizard: dialysis type (hemodialysis or peritoneal), schedule, dry and current weight, then symptoms
• Deterministic rules: the same answers always give the same recommendation, so advice is predictable and explainable
• History of past assessments and a profile
• Local AI tab for on-device help
• Offline-first PWA with a service worker, for patients with limited connectivity`,
        tech: ['Angular 21', 'TypeScript', 'PWA', 'Service Workers', 'Offline-first'],
        year: 2026,
        role: 'Full-stack Developer',
        screenshotAlt: 'Dialysis Support Core symptom assessment wizard',
        category: 'utility',
        featured: false
    },
    {
        id: 'terra-finance',
        name: 'Terra',
        shortDescription: 'Local-first money tracker: expenses, shopping lists and budgets in ZAR, SZL and more, with data kept on your device.',
        longDescription: `Terra is an earthy, privacy-first money tracker. Everything is stored on your own device, so your data is preserved and stays private.

Key Features:
• Log expenses, income and transfers in seconds, with categories and a camera shortcut for receipts
• Shopping lists that learn what you buy and suggest it next time
• Budgets that show how much is left each month
• Multiple currencies including ZAR, SZL, USD, EUR, GBP, BWP and NAD
• Local-first storage with IndexedDB (Dexie), so it works offline
• Quality: Vitest unit tests and Playwright end-to-end tests`,
        tech: ['React', 'TypeScript', 'Vite', 'Dexie (IndexedDB)', 'PWA', 'Vitest', 'Playwright'],
        year: 2026,
        role: 'Creator & Developer',
        screenshotAlt: 'Terra expense entry sheet on mobile',
        category: 'productivity',
        featured: false
    },
    {
        id: 'eventrecon',
        name: 'EventRecon',
        shortDescription: 'Reconstructs an event from many perspectives: people upload video, audio and photos, and the system matches them into one timeline.',
        longDescription: `EventRecon is a prototype for multi-perspective event reconstruction. Several contributors upload their own media of the same event, and the system extracts features and matches them together.

Key Features:
• One deployable service: an Express API that also serves the built Angular app
• In-process media processing: extraction and matching run right after upload, with no separate worker or queue
• Storage: MongoDB for events, media, users and contributions, and S3-compatible storage (MinIO) for the files
• Accounts, events, media and billing routes
• Deployment: Docker Compose for local use and a Render blueprint for hosting`,
        tech: ['Angular', 'Node.js', 'Express', 'MongoDB', 'MinIO / S3', 'Docker', 'Render'],
        year: 2026,
        role: 'Full-stack Developer',
        screenshotAlt: 'EventRecon event reconstruction prototype',
        category: 'utility',
        featured: false
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
        credentials: { username: 'field_operator', password: 'demo@agt123', note: 'Use "project_manager" for admin features' },
        year: 2024,
        role: 'Lead Developer & System Architect',
        screenshotAlt: 'AGT FieldCore field management dashboard',
        category: 'enterprise',
        featured: false,
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
        credentials: { note: 'Use role switcher in demo to access: Customer, Staff, Admin portals' },
        year: 2024,
        role: 'Lead Full-stack Developer & Platform Architect',
        screenshotAlt: 'NexaCore business platform with services and network',
        category: 'marketplace',
        featured: false,
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
        credentials: { note: 'Switch between: Student, Teacher, Admin roles in application' },
        year: 2024,
        role: 'Lead Full-Stack Developer & System Architect',
        screenshotAlt: 'ECOT university management system dashboard',
        category: 'education',
        featured: false,
        metrics: {
            roles: '4 user portals in one',
            programs: '21+ technical diploma programs',
            modules: 'Complete academic management'
        }
    },

    // MANAGEMENT & PRODUCTIVITY,
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
        year: 2024,
        role: 'Full-stack Developer',
        repo: 'https://github.com/geehyness/dixies-sz',
        screenshotAlt: 'Dixies management system dashboard',
        category: 'management',
        featured: false
    },

    // WEB APPS & UTILITIES,
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
            { label: 'Sync Service', url: 'https://gss-ludo-sync.vercel.app', note: 'Game state synchronization' }
        ],
        credentials: { note: 'Guest play or create account for ranked matches' },
        year: 2024,
        role: 'Game Developer & Full-stack Engineer',
        repo: 'https://github.com/geehyness/ludo-kingdom',
        screenshotAlt: 'Ludo Kingdom game board',
        category: 'game',
        featured: false
    },

    // YOUR EXISTING PROJECTS,
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

    // ADDITIONAL PROJECTS,
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
        year: 2024,
        role: 'Template Developer & Designer',
        repo: 'https://github.com/geehyness/school-template',
        screenshotAlt: 'School management template homepage',
        category: 'education',
        featured: false
    }
];
