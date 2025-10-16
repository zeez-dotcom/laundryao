const noop = () => ({});

const Marker = {
  prototype: {
    options: { icon: null },
  },
};

const leaflet = {
  map: noop,
  tileLayer: noop,
  circleMarker: noop,
  popup: noop,
  icon: (options: Record<string, unknown>) => ({ options }),
  Marker,
};

export default leaflet;
