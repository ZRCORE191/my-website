(function (globalScope) {
  const products = [
    {
      id: 1,
      name: "Treadmill Drive Belt Kit",
      category: "treadmill",
      price: 89,
      blurb: "Reinforced low-friction belt with alignment guide for smooth daily use.",
      badge: "Top Rated"
    },
    {
      id: 2,
      name: "Spin Bike Pedal Rebuild Pack",
      category: "bike",
      price: 54,
      blurb: "Includes bearings, toe cages, straps, and hardware for studio bikes.",
      badge: "Fast Install"
    },
    {
      id: 3,
      name: "Selector Cable Replacement Set",
      category: "strength",
      price: 72,
      blurb: "Heavy-duty coated steel cable for smooth resistance machine movement.",
      badge: "Commercial"
    },
    {
      id: 4,
      name: "Performance Deck Cushion Pads",
      category: "treadmill",
      price: 46,
      blurb: "Shock-absorbing deck supports that reduce impact and equipment strain.",
      badge: "Gym Favorite"
    },
    {
      id: 5,
      name: "Flywheel Resistance Knob",
      category: "bike",
      price: 29,
      blurb: "Precision tension control knob with grip texture and locking thread.",
      badge: "New"
    },
    {
      id: 6,
      name: "Pulley and Bearing Service Kit",
      category: "strength",
      price: 64,
      blurb: "Quiet-glide pulley wheels and sealed bearings for cable machines.",
      badge: "Low Noise"
    },
    {
      id: 7,
      name: "Machine Care Lubrication Pack",
      category: "maintenance",
      price: 38,
      blurb: "Cleaner, silicone lube, cloths, and service checklist for routine upkeep.",
      badge: "Bundle"
    },
    {
      id: 8,
      name: "Universal Safety Key and Magnet",
      category: "treadmill",
      price: 19,
      blurb: "Quick replacement for worn or missing treadmill emergency stop keys.",
      badge: "Essential"
    },
    {
      id: 9,
      name: "Bench Hardware Fastener Set",
      category: "maintenance",
      price: 24,
      blurb: "High-strength bolts, washers, and spacers for benches and racks.",
      badge: "Repair Ready"
    }
  ];

  if (typeof module !== "undefined" && module.exports) {
    module.exports = products;
  }

  globalScope.NJB_PRODUCTS = products;
})(typeof window !== "undefined" ? window : globalThis);
