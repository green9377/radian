/*
  ⚠️ RETIRED (21 Jul 2026).

  The Items module used to be one screen that was list + editor at once. It is now split
  into pages (sobuj: "item list and item create jen alada page hoy"):

    /items          → ItemViews.tsx      → ItemsOverview     (decision-first landing)
    /items/list     → ItemListView.tsx   → the table
    /items/new      → ItemEditor.tsx     → create
    /items/[id]     → ItemEditor.tsx     → edit + recipe builder
    /items/groups   → ItemViews.tsx      → ItemGroupsView

  Shared chrome (photo tiles, flags, KPI cards, the model explainer, the stock note)
  lives in ItemUI.tsx so the four screens cannot drift apart.

  This file is intentionally empty — delete it whenever convenient.
*/
export {};
