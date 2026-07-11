// DmIcon — resolves string icon keys to Lucide components
// Usage: <DmIcon name="search" size={24} className="text-terracotta" />
import {
  Search, Bot, Handshake, Shield, ShieldCheck, CheckCircle, Check,
  Briefcase, Hotel, Banknote, Home, Clipboard, ClipboardList,
  Landmark, Zap, Ban, FileText, Key, HardHat, BarChart2,
  TrendingDown, TrendingUp, Users, Droplets, Bath, Shirt,
  Car, Wifi, Utensils, BookOpen, Camera, CreditCard,
  Building2, Store, Leaf, GraduationCap, BedDouble,
  Heart, HeartCrack, MapPin, Map, MessageCircle,
  Lightbulb, Video, Star, X, User, AlertTriangle,
  Gem, Hand, PartyPopper, Vote, Frown, Ruler, Scale,
  Hammer, LayoutDashboard, Building, Fingerprint,
  Lock, Globe, ChevronRight, ArrowRight, Plus, Minus,
  Bell, Settings, LogOut, Menu, Grid, List, Filter,
  Calendar, Clock, Phone, Mail, ExternalLink,
} from 'lucide-react'

const ICON_MAP = {
  'search': Search, 'bot': Bot, 'handshake': Handshake,
  'shield': Shield, 'shield-check': ShieldCheck,
  'check-circle': CheckCircle, 'check': Check,
  'briefcase': Briefcase, 'hotel': Hotel, 'banknote': Banknote,
  'home': Home, 'house': Home, 'clipboard': Clipboard,
  'clipboard-list': ClipboardList, 'landmark': Landmark,
  'zap': Zap, 'ban': Ban, 'file-text': FileText, 'key': Key,
  'hard-hat': HardHat, 'bar-chart': BarChart2, 'bar-chart-2': BarChart2,
  'trending-down': TrendingDown, 'trending-up': TrendingUp,
  'users': Users, 'droplets': Droplets, 'bath': Bath,
  'shirt': Shirt, 'car': Car, 'wifi': Wifi, 'utensils': Utensils,
  'book-open': BookOpen, 'camera': Camera, 'credit-card': CreditCard,
  'building-2': Building2, 'building': Building, 'store': Store,
  'leaf': Leaf, 'graduation-cap': GraduationCap, 'bed-double': BedDouble,
  'bed-single': BedDouble, 'heart': Heart, 'heart-crack': HeartCrack,
  'map-pin': MapPin, 'map': Map, 'message-circle': MessageCircle,
  'lightbulb': Lightbulb, 'video': Video, 'star': Star, 'x': X,
  'user': User, 'alert-triangle': AlertTriangle, 'gem': Gem,
  'hand': Hand, 'party-popper': PartyPopper, 'vote': Vote,
  'frown': Frown, 'ruler': Ruler, 'scale': Scale, 'hammer': Hammer,
  'layout-dashboard': LayoutDashboard, 'fingerprint': Fingerprint,
  'lock': Lock, 'globe': Globe, 'chevron-right': ChevronRight,
  'arrow-right': ArrowRight, 'plus': Plus, 'minus': Minus,
  'bell': Bell, 'settings': Settings, 'log-out': LogOut,
  'menu': Menu, 'grid': Grid, 'list': List, 'filter': Filter,
  'calendar': Calendar, 'clock': Clock, 'phone': Phone,
  'mail': Mail, 'external-link': ExternalLink,
  // Professionals
  'users-round': Users, 'fence': Shield, 'cctv': Camera,
  'shopping-bag': Store, 'hospital': Building2,
}

export default function DmIcon({ name, size = 20, className = '', style = {} }) {
  if (!name) return null
  // If it's already a React element (JSX icon passed directly), render it
  if (typeof name === 'object' && name !== null) return name
  const Icon = ICON_MAP[name] || ICON_MAP[name?.toLowerCase()] || Search
  return <Icon size={size} className={className} style={style} />
}
