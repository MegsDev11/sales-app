import type { FuelEntry, Vehicle } from "@megs/shared";

export function vehicleFromRow(
  row: {
    id: string;
    brand: string;
    number_plate: string;
    technician_id: string;
    qr_token: string;
    active: boolean;
    created_at: string;
    updated_at: string;
  },
  technicianName?: string
): Vehicle {
  return {
    id: row.id,
    brand: row.brand ?? "",
    numberPlate: row.number_plate,
    technicianId: row.technician_id,
    qrToken: row.qr_token,
    active: row.active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    technicianName,
  };
}

export function fuelEntryFromRow(
  row: {
    id: string;
    vehicle_id: string;
    technician_id: string;
    litres: number | string;
    location: string;
    price: number | string;
    recorded_at: string;
    created_at: string;
  },
  extras?: {
    vehicleBrand?: string;
    vehicleNumberPlate?: string;
    technicianName?: string;
  }
): FuelEntry {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    technicianId: row.technician_id,
    litres: Number(row.litres),
    location: row.location ?? "",
    price: Number(row.price),
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
    vehicleBrand: extras?.vehicleBrand,
    vehicleNumberPlate: extras?.vehicleNumberPlate,
    technicianName: extras?.technicianName,
  };
}
