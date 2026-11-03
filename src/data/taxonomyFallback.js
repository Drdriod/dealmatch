// Bundled copy of the Place and People taxonomy (supabase/migrations/20261101000000_taxonomy_v3_merged.sql).
// The navbar menus show this the instant they open and swap to the live database tree as soon as it
// arrives, so the menus are never empty on a slow or blocked connection. A test keeps this file equal
// to the migration. Forms and filters that need category ids always use the live tree, never this.
export const TAXONOMY_FALLBACK = [
  { id: "residential-properties", slug: "residential-properties", name: "Residential Properties", pillar: "place", fallback: true, children: [
    { id: "homes-residential-sales", slug: "homes-residential-sales", name: "Houses for Sale" },
    { id: "houses-for-rent", slug: "houses-for-rent", name: "Houses for Rent" },
    { id: "apartments-flats", slug: "apartments-flats", name: "Apartments & Flats" },
    { id: "student-hostels", slug: "student-hostels", name: "Student Hostels" },
    { id: "coliving-shared-apartments", slug: "coliving-shared-apartments", name: "Co-Living & Shared Apartments" },
  ] },
  { id: "commercial-properties", slug: "commercial-properties", name: "Commercial Properties", pillar: "place", fallback: true, children: [
    { id: "offices", slug: "offices", name: "Offices" },
    { id: "shops-retail-spaces", slug: "shops-retail-spaces", name: "Shops & Retail Spaces" },
    { id: "warehouses", slug: "warehouses", name: "Warehouses" },
    { id: "commercial-buildings", slug: "commercial-buildings", name: "Commercial Buildings" },
    { id: "coworking-spaces", slug: "coworking-spaces", name: "Co-Working Spaces" },
  ] },
  { id: "land-and-plots", slug: "land-and-plots", name: "Land & Plots", pillar: "place", fallback: true, children: [
    { id: "residential-land", slug: "residential-land", name: "Residential Land" },
    { id: "commercial-land", slug: "commercial-land", name: "Commercial Land" },
    { id: "agricultural-land", slug: "agricultural-land", name: "Agricultural Land" },
  ] },
  { id: "hospitality-stays", slug: "hospitality-stays", name: "Hospitality & Accommodation", pillar: "place", fallback: true, children: [
    { id: "hotels-boutique-stays", slug: "hotels-boutique-stays", name: "Hotels & Boutique Stays" },
    { id: "guest-houses", slug: "guest-houses", name: "Guest Houses" },
    { id: "serviced-apartments", slug: "serviced-apartments", name: "Serviced Apartments" },
    { id: "short-lets-vacation-stays", slug: "short-lets-vacation-stays", name: "Short-lets & Vacation Stays" },
  ] },
  { id: "event-recreation-spaces", slug: "event-recreation-spaces", name: "Event & Recreation Spaces", pillar: "place", fallback: true, children: [
    { id: "event-centres", slug: "event-centres", name: "Event Centres" },
    { id: "conference-halls", slug: "conference-halls", name: "Conference Halls" },
    { id: "outdoor-venues", slug: "outdoor-venues", name: "Outdoor Venues" },
    { id: "recreational-facilities", slug: "recreational-facilities", name: "Recreational Facilities" },
  ] },
  { id: "auto-services", slug: "auto-services", name: "Auto Services", pillar: "people", fallback: true, children: [
    { id: "vehicle-repair-diagnostics", slug: "vehicle-repair-diagnostics", name: "Vehicle Repair & Diagnostics" },
    { id: "auto-services-parts", slug: "auto-services-parts", name: "Auto Maintenance, Parts & Services" },
  ] },
  { id: "creatives-lifestyle", slug: "creatives-lifestyle", name: "Creativity & Lifestyle", pillar: "people", fallback: true, children: [
    { id: "photographers-videographers", slug: "photographers-videographers", name: "Photographers & Videographers" },
    { id: "designers", slug: "designers", name: "Designers" },
    { id: "beauty-grooming-personal-care", slug: "beauty-grooming-personal-care", name: "Beauty, Grooming & Personal Care" },
    { id: "muas-barbers-stylists", slug: "muas-barbers-stylists", name: "Makeup Artists, Barbers & Stylists" },
    { id: "tailors-fashion-designers", slug: "tailors-fashion-designers", name: "Tailors & Fashion Designers" },
  ] },
  { id: "home-property-care", slug: "home-property-care", name: "Home & Property Care", pillar: "people", fallback: true, children: [
    { id: "ac-technicians-plumbers", slug: "ac-technicians-plumbers", name: "AC Technicians & Plumbers" },
    { id: "electricians-solar-inverter", slug: "electricians-solar-inverter", name: "Electricians, Solar & Inverter Technicians" },
    { id: "generator-mechanics", slug: "generator-mechanics", name: "Generator Mechanics & Technicians" },
    { id: "cleaning-moving-facility", slug: "cleaning-moving-facility", name: "Cleaning & Facility Services" },
    { id: "turnover-cleaners-housekeepers", slug: "turnover-cleaners-housekeepers", name: "Short-Let Turnover Cleaners & Housekeepers" },
    { id: "security-personnel", slug: "security-personnel", name: "Security Personnel & Gatekeepers" },
    { id: "cooks-nannies-caregivers", slug: "cooks-nannies-caregivers", name: "Cooks, Nannies, Caregivers & Domestic Help" },
    { id: "maintenance-handymen", slug: "maintenance-handymen", name: "Maintenance & Handymen" },
  ] },
  { id: "trades-craftsmen", slug: "trades-craftsmen", name: "Trades & Craftsmen", pillar: "people", fallback: true, children: [
    { id: "masons-pop-technicians", slug: "masons-pop-technicians", name: "Masons, Bricklayers & POP Technicians" },
    { id: "carpenters-woodworkers", slug: "carpenters-woodworkers", name: "Carpenters & Woodworkers" },
    { id: "painters-decorators", slug: "painters-decorators", name: "Painters & Decorators" },
    { id: "tilers-flooring", slug: "tilers-flooring", name: "Tilers & Flooring Specialists" },
    { id: "welders-fabricators", slug: "welders-fabricators", name: "Welders & Metal Fabricators" },
    { id: "artisans", slug: "artisans", name: "Skilled Artisans" },
  ] },
  { id: "licensed-experts", slug: "licensed-experts", name: "Licensed Experts", pillar: "people", fallback: true, children: [
    { id: "architects-building-consultants", slug: "architects-building-consultants", name: "Architects & Building Consultants" },
    { id: "valuation-surveyors-engineers", slug: "valuation-surveyors-engineers", name: "NIESV Valuation Surveyors" },
    { id: "registered-land-surveyors", slug: "registered-land-surveyors", name: "SURCON Registered Land Surveyors" },
    { id: "civil-engineers", slug: "civil-engineers", name: "Civil Engineers" },
    { id: "real-estate-attorneys", slug: "real-estate-attorneys", name: "Real Estate Attorneys & Title Lawyers" },
    { id: "corporate-legal", slug: "corporate-legal", name: "Corporate & Legal" },
    { id: "other-licensed-professions", slug: "other-licensed-professions", name: "Other Licensed Professions" },
  ] },
  { id: "professional-business-services", slug: "professional-business-services", name: "Professional & Business Services", pillar: "people", fallback: true, children: [
    { id: "consulting", slug: "consulting", name: "Consulting" },
    { id: "accounting", slug: "accounting", name: "Accounting" },
    { id: "business-support", slug: "business-support", name: "Business Support" },
    { id: "b2b-procurement", slug: "b2b-procurement", name: "B2B Procurement" },
    { id: "tech-digital-services", slug: "tech-digital-services", name: "Tech & Digital Services" },
    { id: "professionals", slug: "professionals", name: "Real Estate Professionals" },
  ] },
  { id: "logistics-mobility", slug: "logistics-mobility", name: "Logistics & Mobility", pillar: "people", fallback: true, children: [
    { id: "drivers-machinery-operators", slug: "drivers-machinery-operators", name: "Pro Drivers, Haulage Drivers & Heavy Equipment Operators" },
    { id: "delivery", slug: "delivery", name: "Delivery" },
    { id: "home-office-relocation", slug: "home-office-relocation", name: "Home & Office Relocation" },
    { id: "interstate-haulage-freight", slug: "interstate-haulage-freight", name: "Inter-State Haulage & Freight" },
    { id: "agricultural-logistics", slug: "agricultural-logistics", name: "Agricultural Logistics" },
  ] },
  { id: "education", slug: "education", name: "Education", pillar: "people", fallback: true, children: [
    { id: "academic-home-tutors", slug: "academic-home-tutors", name: "Academic & Home Lesson Tutors" },
    { id: "training", slug: "training", name: "Training" },
    { id: "coaching", slug: "coaching", name: "Coaching" },
  ] },
  { id: "events", slug: "events", name: "Events", pillar: "people", fallback: true, children: [
    { id: "event-planners", slug: "event-planners", name: "Event Planners" },
    { id: "caterers-bakers", slug: "caterers-bakers", name: "Caterers & Bakers" },
    { id: "djs-mcs-sound-engineers", slug: "djs-mcs-sound-engineers", name: "DJs, MCs & Sound Engineers" },
    { id: "event-coordination", slug: "event-coordination", name: "Event Coordination" },
  ] },
  { id: "health-wellness", slug: "health-wellness", name: "Health & Wellness", pillar: "people", fallback: true, children: [
    { id: "fitness-trainers", slug: "fitness-trainers", name: "Fitness Trainers & Sports Coaches" },
    { id: "wellness", slug: "wellness", name: "Wellness" },
    { id: "in-home-healthcare", slug: "in-home-healthcare", name: "In-Home Healthcare" },
    { id: "health-professionals", slug: "health-professionals", name: "Health Professionals" },
  ] },
]

// The approved order of groups and subcategories (the live tree has no sort column, so it is
// sorted by this). Anything not listed goes last, alphabetically.
const ORDER = new Map(TAXONOMY_FALLBACK.flatMap((g, gi) => [
  [g.slug, gi],
  ...g.children.map((c, ci) => [c.slug, ci]),
]))
export function sortByTaxonomy(items) {
  return [...items].sort((a, b) => {
    const ai = ORDER.has(a.slug) ? ORDER.get(a.slug) : 1e6
    const bi = ORDER.has(b.slug) ? ORDER.get(b.slug) : 1e6
    return ai - bi || String(a.name).localeCompare(String(b.name))
  })
}
