import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Logger } from "pino";

import { db } from "../db";
import type { DriverLocationSnapshot, IStorage } from "../storage";
import { haversineDistance } from "../utils/geolocation";
import {
  customerAddresses,
  deliveryOrders,
  driverLocationTelemetry,
  orders,
  users,
  type DeliveryStatus,
} from "@shared/schema";

const DEFAULT_SPEED_KPH = 32;
const LOOKBACK_MINUTES = 180;
const MAX_AUTOMATION_ETA_MINUTES = 75;
const MAX_LOCATION_AGE_MINUTES = 20;
const DEFAULT_DRIVER_CAPACITY = 4;
const GUARANTEED_CAPACITY_BUFFER = 1;

export type EtaPrediction = {
  driverId: string;
  deliveryId?: string;
  etaMinutes: number;
  distanceKm: number;
  confidence: number;
  sampleSize: number;
  averageSpeedKph: number;
  basis?: string[];
};

export type AssignmentRecommendation = {
  deliveryId: string;
  driverId: string;
  etaMinutes: number;
  distanceKm: number;
  confidence: number;
  reasons: string[];
};

export type AssignmentPlan = {
  generatedAt: string;
  assignments: AssignmentRecommendation[];
  unassignedDeliveries: string[];
};

export type ControlTowerOverview = {
  generatedAt: string;
  branchId: string;
  telemetryWindowMinutes: number;
  drivers: Array<{
    id: string;
    name: string;
    status: string;
    availableCapacity: number;
    activeDeliveries: number;
    location: DriverLocationSnapshot | null;
    metrics: {
      averageSpeedKph: number;
      pingSampleSize: number;
      lastUpdateIso: string | null;
      reliability: number;
    };
  }>;
  deliveries: Array<{
    deliveryId: string;
    orderId: string;
    status: DeliveryStatus;
    etaMinutes: number | null;
    distanceKm: number | null;
    slaMinutes: number | null;
    riskLevel: "ok" | "warning" | "breach";
    assignedDriverId: string | null;
    location: { lat: number; lng: number } | null;
  }>;
  slaHeatmap: Array<{
    lat: number;
    lng: number;
    breachCount: number;
    severity: number;
  }>;
};

interface DeliveryOptimizationDeps {
  storage: IStorage;
  logger: Logger;
}

interface RecommendOptions {
  branchId: string;
  deliveryIds?: string[];
  respectManualAssignments?: boolean;
}

export class DeliveryOptimizationService {
  private readonly storage: IStorage;
  private readonly logger: Logger;

  constructor({ storage, logger }: DeliveryOptimizationDeps) {
    this.storage = storage;
    this.logger = logger;
  }

  private async getDriverStats(driverId: string, lookbackMinutes = LOOKBACK_MINUTES) {
    const since = new Date(Date.now() - lookbackMinutes * 60 * 1000);
    const rows = await db
      .select({
        recordedAt: driverLocationTelemetry.recordedAt,
        lat: driverLocationTelemetry.lat,
        lng: driverLocationTelemetry.lng,
        speedKph: driverLocationTelemetry.speedKph,
      })
      .from(driverLocationTelemetry)
      .where(and(eq(driverLocationTelemetry.driverId, driverId), gte(driverLocationTelemetry.recordedAt, since)))
      .orderBy(desc(driverLocationTelemetry.recordedAt))
      .limit(500);

    if (rows.length === 0) {
      return {
        averageSpeedKph: DEFAULT_SPEED_KPH,
        sampleSize: 0,
        confidence: 0,
        reliability: 0,
      };
    }

    const speeds = rows
      .map((row) => (row.speedKph != null ? Number(row.speedKph) : undefined))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

    const averageSpeedKph = speeds.length
      ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length
      : DEFAULT_SPEED_KPH;

    let pingDistances = 0;
    for (let i = 0; i < rows.length - 1; i += 1) {
      const current = rows[i];
      const previous = rows[i + 1];
      const currentLat = Number(current.lat);
      const currentLng = Number(current.lng);
      const prevLat = Number(previous.lat);
      const prevLng = Number(previous.lng);
      pingDistances += haversineDistance(currentLat, currentLng, prevLat, prevLng);
    }

    const coverageKm = pingDistances;
    const reliability = Math.min(1, coverageKm / Math.max(rows.length * 0.5, 1));
    const confidence = Math.min(1, rows.length / 20 + reliability * 0.5);

    return {
      averageSpeedKph: Number.isFinite(averageSpeedKph) && averageSpeedKph > 5 ? averageSpeedKph : DEFAULT_SPEED_KPH,
      sampleSize: rows.length,
      confidence,
      reliability,
    };
  }

  async predictEta(
    driverId: string,
    destination: { lat: number; lng: number },
    options: { activeStops?: number; currentLocation?: DriverLocationSnapshot | null } = {},
  ): Promise<EtaPrediction | null> {
    const latestLocation = options.currentLocation ?? (await this.storage.getLatestDriverLocation(driverId));
    if (!latestLocation) {
      return null;
    }

    const stats = await this.getDriverStats(driverId);
    const baseSpeed = stats.averageSpeedKph || DEFAULT_SPEED_KPH;
    const distanceKm = haversineDistance(latestLocation.lat, latestLocation.lng, destination.lat, destination.lng);

    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
      return null;
    }

    const travelMinutes = distanceKm <= 0 ? 0 : (distanceKm / Math.max(baseSpeed, 5)) * 60;
    const stopPenalty = (options.activeStops ?? 0) * 4;
    const etaMinutes = travelMinutes + stopPenalty;

    return {
      driverId,
      etaMinutes: Math.max(0, Math.round(etaMinutes * 10) / 10),
      distanceKm: Math.round(distanceKm * 100) / 100,
      confidence: stats.confidence,
      sampleSize: stats.sampleSize,
      averageSpeedKph: Math.round(baseSpeed * 10) / 10,
    };
  }

  async recommendAssignments({ branchId, deliveryIds, respectManualAssignments = true }: RecommendOptions): Promise<AssignmentPlan> {
    const deliveries = await this.storage.getDeliveryOrders(branchId, undefined);
    const activeStatuses: DeliveryStatus[] = [
      "pending",
      "accepted",
      "driver_enroute",
      "picked_up",
      "processing_started",
      "ready",
      "out_for_delivery",
    ];

    const filteredDeliveries = deliveries.filter((delivery) =>
      activeStatuses.includes(delivery.deliveryStatus as DeliveryStatus),
    );
    const scopedDeliveries = deliveryIds?.length
      ? filteredDeliveries.filter((delivery) => deliveryIds.includes(delivery.id))
      : filteredDeliveries;

    const addressIds = scopedDeliveries
      .map((delivery: any) => delivery.deliveryAddressId as string | null | undefined)
      .filter((value): value is string => Boolean(value));

    const addressRows = addressIds.length
      ? await db
          .select({ id: customerAddresses.id, lat: customerAddresses.lat, lng: customerAddresses.lng })
          .from(customerAddresses)
          .where(inArray(customerAddresses.id, addressIds))
      : [];
    const addressMap = new Map(addressRows.map((row) => [row.id, row]));

    const driverIds = Array.from(
      new Set(
        filteredDeliveries
          .map((delivery) => delivery.driverId as string | null | undefined)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const driverRows = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(and(eq(users.role, "driver"), eq(users.isActive, true), eq(users.branchId, branchId)));

    const driverNameMap = new Map(
      driverRows.map((row) => [row.id, [row.firstName, row.lastName].filter(Boolean).join(" ") || "Driver"]),
    );

    const latestLocations = await this.storage.getLatestDriverLocations(driverRows.map((row) => row.id));
    const locationMap = new Map(latestLocations.map((snapshot) => [snapshot.driverId, snapshot]));

    const driverLoad = new Map<string, number>();
    for (const delivery of filteredDeliveries) {
      if (!delivery.driverId) continue;
      driverLoad.set(delivery.driverId, (driverLoad.get(delivery.driverId) ?? 0) + 1);
    }

    const candidateDrivers = driverRows.map((row) => {
      const load = driverLoad.get(row.id) ?? 0;
      return {
        id: row.id,
        name: driverNameMap.get(row.id) ?? row.id,
        location: locationMap.get(row.id) ?? null,
        availableCapacity: Math.max(0, DEFAULT_DRIVER_CAPACITY - load - GUARANTEED_CAPACITY_BUFFER),
        activeDeliveries: load,
      };
    });

    const assignments: AssignmentRecommendation[] = [];
    const unassigned: string[] = [];

    for (const delivery of scopedDeliveries) {
      if (respectManualAssignments && delivery.driverId) {
        continue;
      }
      const addrId = (delivery as any).deliveryAddressId as string | null | undefined;
      if (!addrId) {
        unassigned.push(delivery.id);
        continue;
      }
      const address = addressMap.get(addrId);
      if (!address || address.lat == null || address.lng == null) {
        unassigned.push(delivery.id);
        continue;
      }

      const viableDrivers = candidateDrivers.filter((driver) => driver.availableCapacity > 0 && driver.location);
      if (viableDrivers.length === 0) {
        unassigned.push(delivery.id);
        continue;
      }

      let best: AssignmentRecommendation | null = null;
      for (const driver of viableDrivers) {
        const eta = await this.predictEta(driver.id, { lat: Number(address.lat), lng: Number(address.lng) }, {
          activeStops: driver.activeDeliveries,
          currentLocation: driver.location ?? undefined,
        });
        if (!eta) continue;
        const reasons = [
          `avg_speed:${eta.averageSpeedKph.toFixed(1)}`,
          `confidence:${eta.confidence.toFixed(2)}`,
        ];
        const proposal: AssignmentRecommendation = {
          deliveryId: delivery.id,
          driverId: driver.id,
          etaMinutes: eta.etaMinutes,
          distanceKm: eta.distanceKm,
          confidence: eta.confidence,
          reasons,
        };
        if (!best || proposal.etaMinutes < best.etaMinutes) {
          best = proposal;
        }
      }

      if (best) {
        assignments.push(best);
        const driver = candidateDrivers.find((entry) => entry.id === best!.driverId);
        if (driver) {
          driver.availableCapacity = Math.max(0, driver.availableCapacity - 1);
          driver.activeDeliveries += 1;
        }
      } else {
        unassigned.push(delivery.id);
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      assignments,
      unassignedDeliveries: Array.from(new Set(unassigned)),
    };
  }

  async autoAssignDelivery(deliveryId: string): Promise<AssignmentRecommendation | null> {
    const [deliveryRow] = await db
      .select({
        delivery: deliveryOrders,
        order: orders,
      })
      .from(deliveryOrders)
      .innerJoin(orders, eq(deliveryOrders.orderId, orders.id))
      .where(eq(deliveryOrders.id, deliveryId))
      .limit(1);

    if (!deliveryRow) {
      this.logger.warn({ deliveryId }, "auto-assign skipped: delivery not found");
      return null;
    }

    const delivery = deliveryRow.delivery as typeof deliveryRow.delivery & { deliveryAddressId?: string | null };
    const order = deliveryRow.order;
    if (!delivery.branchId) {
      this.logger.warn({ deliveryId }, "auto-assign skipped: missing branchId");
      return null;
    }

    if (!delivery.deliveryAddressId) {
      this.logger.info({ deliveryId }, "auto-assign skipped: missing delivery address");
      return null;
    }

    const [address] = await db
      .select({ lat: customerAddresses.lat, lng: customerAddresses.lng })
      .from(customerAddresses)
      .where(eq(customerAddresses.id, delivery.deliveryAddressId))
      .limit(1);

    if (!address || address.lat == null || address.lng == null) {
      this.logger.info({ deliveryId }, "auto-assign skipped: incomplete address coordinates");
      return null;
    }

    const plan = await this.recommendAssignments({ branchId: delivery.branchId, deliveryIds: [deliveryId] });
    const suggestion = plan.assignments.find((entry) => entry.deliveryId === deliveryId);
    if (!suggestion) {
      this.logger.info({ deliveryId }, "auto-assign skipped: no viable driver");
      return null;
    }

    if (suggestion.etaMinutes > MAX_AUTOMATION_ETA_MINUTES) {
      this.logger.info({ deliveryId, etaMinutes: suggestion.etaMinutes }, "auto-assign skipped: ETA exceeds guardrails");
      return null;
    }

    const latest = await this.storage.getLatestDriverLocation(suggestion.driverId);
    if (!latest) {
      this.logger.info({ deliveryId, driverId: suggestion.driverId }, "auto-assign skipped: missing driver location");
      return null;
    }

    const locationAgeMinutes = (Date.now() - latest.timestamp.getTime()) / (60 * 1000);
    if (locationAgeMinutes > MAX_LOCATION_AGE_MINUTES) {
      this.logger.info(
        { deliveryId, driverId: suggestion.driverId, locationAgeMinutes },
        "auto-assign skipped: stale driver location",
      );
      return null;
    }

    const updated = await this.storage.assignDeliveryOrder(delivery.orderId, suggestion.driverId);
    if (!updated) {
      this.logger.warn({ deliveryId, driverId: suggestion.driverId }, "auto-assign failed: storage rejected assignment");
      return null;
    }

    this.logger.info(
      {
        deliveryId,
        orderId: order.id,
        driverId: suggestion.driverId,
        etaMinutes: suggestion.etaMinutes,
      },
      "auto-assign applied",
    );
    return suggestion;
  }

  async buildControlTowerOverview(branchId: string): Promise<ControlTowerOverview> {
    const plan = await this.recommendAssignments({ branchId, respectManualAssignments: false });
    const deliveries = await this.storage.getDeliveryOrders(branchId, undefined);
    const activeStatuses: DeliveryStatus[] = [
      "pending",
      "accepted",
      "driver_enroute",
      "picked_up",
      "processing_started",
      "ready",
      "out_for_delivery",
    ];
    const activeDeliveries = deliveries.filter((delivery) => activeStatuses.includes(delivery.deliveryStatus as DeliveryStatus));

    const addressIds = activeDeliveries
      .map((delivery: any) => delivery.deliveryAddressId as string | null | undefined)
      .filter((value): value is string => Boolean(value));
    const addressRows = addressIds.length
      ? await db
          .select({ id: customerAddresses.id, lat: customerAddresses.lat, lng: customerAddresses.lng })
          .from(customerAddresses)
          .where(inArray(customerAddresses.id, addressIds))
      : [];
    const addressMap = new Map(addressRows.map((row) => [row.id, row]));

    const driverRows = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(and(eq(users.role, "driver"), eq(users.branchId, branchId), eq(users.isActive, true)));
    const driverNameMap = new Map(
      driverRows.map((row) => [row.id, [row.firstName, row.lastName].filter(Boolean).join(" ") || "Driver"]),
    );

    const latestLocations = await this.storage.getLatestDriverLocations(driverRows.map((row) => row.id));
    const locationMap = new Map(latestLocations.map((snapshot) => [snapshot.driverId, snapshot]));

    const drivers = await Promise.all(
      driverRows.map(async (driver) => {
        const stats = await this.getDriverStats(driver.id, LOOKBACK_MINUTES);
        const activeCount = activeDeliveries.filter((delivery) => delivery.driverId === driver.id).length;
        const availableCapacity = Math.max(0, DEFAULT_DRIVER_CAPACITY - activeCount - GUARANTEED_CAPACITY_BUFFER);
        const location = locationMap.get(driver.id) ?? null;
        return {
          id: driver.id,
          name: driverNameMap.get(driver.id) ?? driver.id,
          status: availableCapacity > 0 ? "available" : "saturated",
          availableCapacity,
          activeDeliveries: activeCount,
          location,
          metrics: {
            averageSpeedKph: Math.round(stats.averageSpeedKph * 10) / 10,
            pingSampleSize: stats.sampleSize,
            lastUpdateIso: location ? location.timestamp.toISOString() : null,
            reliability: Math.round(stats.reliability * 100) / 100,
          },
        };
      }),
    );

    const assignmentsByDelivery = new Map(plan.assignments.map((assignment) => [assignment.deliveryId, assignment]));
    const overviewDeliveries = await Promise.all(
      activeDeliveries.map(async (delivery) => {
        const addrId = (delivery as any).deliveryAddressId as string | undefined;
        const address = addrId ? addressMap.get(addrId) : undefined;
        let eta: EtaPrediction | null = null;
        if (delivery.driverId && address && address.lat != null && address.lng != null) {
          eta = await this.predictEta(delivery.driverId, { lat: Number(address.lat), lng: Number(address.lng) });
        }
        const recommendation = assignmentsByDelivery.get(delivery.id);
        const etaMinutes = eta?.etaMinutes ?? recommendation?.etaMinutes ?? null;
        const distanceKm = eta?.distanceKm ?? recommendation?.distanceKm ?? null;
        const slaMinutes = delivery.scheduledDeliveryTime
          ? (delivery.scheduledDeliveryTime.getTime() - Date.now()) / (60 * 1000)
          : null;
        let riskLevel: "ok" | "warning" | "breach" = "ok";
        if (etaMinutes != null && slaMinutes != null) {
          if (etaMinutes > slaMinutes) {
            riskLevel = "breach";
          } else if (etaMinutes > slaMinutes * 0.75) {
            riskLevel = "warning";
          }
        } else if (etaMinutes != null && etaMinutes > 60) {
          riskLevel = "warning";
        }
        return {
          deliveryId: delivery.id,
          orderId: delivery.orderId,
          status: delivery.deliveryStatus as DeliveryStatus,
          etaMinutes: etaMinutes != null ? Math.round(etaMinutes * 10) / 10 : null,
          distanceKm: distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
          slaMinutes: slaMinutes != null ? Math.round(slaMinutes * 10) / 10 : null,
          riskLevel,
          assignedDriverId: delivery.driverId ?? null,
          location:
            address && address.lat != null && address.lng != null
              ? { lat: Number(address.lat), lng: Number(address.lng) }
              : null,
        };
      }),
    );

    const slaHeatmapAccumulator = new Map<string, { lat: number; lng: number; breachCount: number }>();
    for (const item of overviewDeliveries) {
      if (item.riskLevel !== "breach" || !item.location) continue;
      const key = `${item.location.lat.toFixed(2)}|${item.location.lng.toFixed(2)}`;
      const existing = slaHeatmapAccumulator.get(key);
      if (existing) {
        existing.breachCount += 1;
      } else {
        slaHeatmapAccumulator.set(key, { lat: item.location.lat, lng: item.location.lng, breachCount: 1 });
      }
    }

    const slaHeatmap = Array.from(slaHeatmapAccumulator.values()).map((entry) => ({
      lat: entry.lat,
      lng: entry.lng,
      breachCount: entry.breachCount,
      severity: Math.min(1, entry.breachCount / 5),
    }));

    return {
      generatedAt: new Date().toISOString(),
      branchId,
      telemetryWindowMinutes: LOOKBACK_MINUTES,
      drivers,
      deliveries: overviewDeliveries,
      slaHeatmap,
    };
  }
}
