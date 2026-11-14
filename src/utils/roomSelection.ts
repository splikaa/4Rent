import { Room } from '../types/rental';
import { formatKwhReading, roundKwh } from './financialEngine';

/**
 * Formats ONLY the primary room label (e.g., "Room 1", "Room 2", "Room 3")
 * without mixing tenant names or sub-meter readings inside dropdown labels.
 */
export function formatPrimaryRoomLabel(
  room: Pick<Room, 'name'> | string
): string {
  const raw = (typeof room === 'string' ? room : room.name || '').trim();
  if (!raw) return 'Room';
  if (/^\d+$/.test(raw)) {
    return `Room ${raw}`;
  }
  return raw;
}

/**
 * Filters archived rooms, prevents duplicate canonical room labels from sync collisions,
 * and returns naturally sorted active rooms (Room 1, Room 2, Room 3, ... Room 10).
 */
export function sortAndDeduplicateActiveRooms(rooms: Room[]): Room[] {
  const active = rooms.filter((r) => !r.isArchived);
  const canonicalMap = new Map<string, Room>();

  for (const room of active) {
    const key = formatPrimaryRoomLabel(room).toLowerCase();
    const existing = canonicalMap.get(key);
    if (!existing) {
      canonicalMap.set(key, room);
      continue;
    }

    // Prefer occupied room with tenant data; break ties by latest updatedAt timestamp
    const existingOccupied = existing.status === 'occupied' && Boolean(existing.tenant);
    const candidateOccupied = room.status === 'occupied' && Boolean(room.tenant);
    if (candidateOccupied && !existingOccupied) {
      canonicalMap.set(key, room);
    } else if (candidateOccupied === existingOccupied) {
      const existingTime = new Date(existing.updatedAt || 0).getTime();
      const candidateTime = new Date(room.updatedAt || 0).getTime();
      if (candidateTime >= existingTime) {
        canonicalMap.set(key, room);
      }
    }
  }

  return Array.from(canonicalMap.values()).sort((a, b) =>
    formatPrimaryRoomLabel(a).localeCompare(formatPrimaryRoomLabel(b), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

export interface SelectedRoomInfoSummary {
  roomId: string;
  roomLabel: string;
  tenantName: string;
  isOccupied: boolean;
  storedReadingKwh: number;
  storedReadingFormatted: string;
  advanceCredit: number;
  unpaidBalance: number;
}

export function getSelectedRoomInfoSummary(
  room: Room | undefined
): SelectedRoomInfoSummary | null {
  if (!room) return null;
  const isOccupied = room.status === 'occupied';
  const storedReadingKwh = roundKwh(room.lastMeterReading || 0);
  return {
    roomId: room.id,
    roomLabel: formatPrimaryRoomLabel(room),
    tenantName: isOccupied
      ? room.tenant?.fullName || 'Assigned Tenant'
      : 'Vacant (No Active Tenant)',
    isOccupied,
    storedReadingKwh,
    storedReadingFormatted: formatKwhReading(storedReadingKwh),
    advanceCredit: isOccupied ? Math.max(0, room.advanceRent || 0) : 0,
    unpaidBalance: isOccupied ? Math.max(0, room.unpaidBalance || 0) : 0,
  };
}
