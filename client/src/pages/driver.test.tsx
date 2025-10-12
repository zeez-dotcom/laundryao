import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import DriverDashboard from "./driver";

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({
    user: { id: "driver-1" },
  }),
}));

vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({
    t: {
      driverDashboard: "Driver Dashboard",
      orderNumber: "Order Number",
      address: "Address",
      status: "Status",
    },
  }),
}));

const invalidateQueriesMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: [] })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: invalidateQueriesMock })),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

describe("DriverDashboard WebSocket scheme", () => {
  const originalGeolocation = navigator.geolocation;
  const originalLocation = globalThis.location;
  let WebSocketMock: ReturnType<typeof vi.fn>;
  let secureLocation: Location;

  beforeEach(() => {
    WebSocketMock = vi.fn(() => ({
      close: vi.fn(),
      send: vi.fn(),
      onmessage: null,
    }));
    vi.stubGlobal("WebSocket", WebSocketMock);
    secureLocation = {
      ...originalLocation,
      protocol: "https:",
      host: "secure.example.com",
    } as Location;
    vi.stubGlobal("__TEST_LOCATION__", secureLocation);
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      },
      configurable: true,
    });
    invalidateQueriesMock.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: originalGeolocation,
      configurable: true,
    });
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uses wss scheme when page is loaded over https", async () => {
    render(<DriverDashboard />);

    await waitFor(() => {
      expect(WebSocketMock).toHaveBeenCalledWith("wss://secure.example.com/ws/delivery-orders");
    });
    expect(WebSocketMock).toHaveBeenCalledWith("wss://secure.example.com/ws/driver-location");
  });
});
