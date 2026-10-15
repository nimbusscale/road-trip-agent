# Road Trip Planner: Design Docs

These docs describe what the app does and how it's built. Read this file first. Then read only the docs that your change touches. Most changes need one or two of them, not all.

Functional spec section 4 defines the terms the other docs use, such as stay, leg, and stop. Read it whenever a term is unclear.

| Doc | What it covers | Read it when |
|---|---|---|
| [Functional spec](functional-spec.md) | What the app does for the user: the planning conversation, feasibility checks, recommendations, weather, the itinerary view, and sessions. No models, tools, or data sources | Changing what the user sees or how the planning behaves |
| [Technical spec](technical-spec.md) | How the app works under the hood: the agents, what each one does, which tools each gets, memory, the feasibility checks in code, and settings | Changing an agent, its instructions, memory, a check, or a setting |
| [Domain model](domain-model.md) | The objects in a trip, such as trip, stay, day, and stop: their properties, operations, and rules, and the services that hold the business rules | Changing what a trip holds, or a rule about it |
| [Tool design](tools.md) | The agents' custom tools: which MCP server each is on, what it takes and returns, and which agents get it | Adding or changing a tool |
| [Systems design](systems.md) | Where the app runs and how its parts connect: the server and its containers, sign-in, the browser and the app, local development, deploys, secrets, and backups | Changing how the app is hosted, deployed, or signed in to |
| [Persistence](persistence.md) | How a trip, its sessions, and memory are stored and saved, and the classes that read and write them | Changing how anything is stored or saved |
| [Data sources](data-sources/README.md) | The outside services the tools call, such as Google, web search, and Open-Meteo. Its README says which source covers each data need. Each other file covers one source | Changing a tool that calls an outside service. Read the README, then only the source's own file |
