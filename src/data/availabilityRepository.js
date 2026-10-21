// Repository (structural pattern) for the owner's availability screen (AvailabilityPage):
// hotel and shortlet room categories, rental occupancy, and student hostel rooms.
// The page calls these and never builds a query.
import { supabase } from '@/lib/supabase'

// ── Hotels and shortlets ──

// The owner's hotels and shortlets, newest first.
export function fetchHotelProperties(sellerId) {
  return supabase
    .from('properties')
    .select('id, title, city, state, category')
    .eq('seller_id', sellerId)
    .in('category', ['hotel', 'shortlet'])
    .order('created_at', { ascending: false })
}

// The active room categories of one property, by name.
export function fetchActiveRoomCategories(propertyId) {
  return supabase
    .from('room_categories')
    .select('*')
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .order('name')
}

// Adds a room category. The caller supplies the whole row.
export function insertRoomCategory(row) {
  return supabase.from('room_categories').insert(row)
}

// Sets how many rooms of a category are free right now.
export function setRoomsAvailable(categoryId, availableRooms) {
  return supabase
    .from('room_categories')
    .update({ available_rooms: availableRooms, updated_at: new Date().toISOString() })
    .eq('id', categoryId)
}

// ── Rentals ──

// The owner's rental units, newest first.
export function fetchRentalUnits(sellerId) {
  return supabase
    .from('properties')
    .select('id, title, city, state, status, price, occupancy_status')
    .eq('seller_id', sellerId)
    .eq('category', 'rental')
    .order('created_at', { ascending: false })
}

// Marks a rental 'occupied' or 'vacant'. An occupied rental is hidden from new enquiries.
export function setOccupancy(propertyId, occupancyStatus) {
  return supabase
    .from('properties')
    .update({ occupancy_status: occupancyStatus, updated_at: new Date().toISOString() })
    .eq('id', propertyId)
}

// ── Student hostels ──

// The owner's hostel listings, newest first.
export function fetchHostelRooms(ownerId) {
  return supabase
    .from('student_hostels')
    .select('id, title, city, state, room_type, rooms_available, total_rooms, status')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
}

// Sets how many rooms of a hostel listing are free right now.
export function setHostelRoomsAvailable(hostelId, roomsAvailable) {
  return supabase
    .from('student_hostels')
    .update({ rooms_available: roomsAvailable, updated_at: new Date().toISOString() })
    .eq('id', hostelId)
}
