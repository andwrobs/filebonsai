# 0002: Begin as a modular monolith

Status: accepted

Use one Java backend deployment with capability-first internal modules. Do not split Catalog, Transfers, Identity, Storage, or Processing into network services until operational or domain pressure creates a real boundary. If splitting becomes necessary, name services by responsibility rather than implementation order.
