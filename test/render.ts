import { findFamily } from "../src/families/index.js"

const samples: Record<string, string> = {
  pie: `pie showData
    title Languages
    "TypeScript" : 55
    "Python" : 25
    "Go" : 20`,
  xychart: `xychart-beta
    title "Sales"
    x-axis [jan, feb, mar, apr]
    y-axis "Units" 0 --> 100
    bar [30, 60, 90, 70]
    line [25, 55, 85, 65]`,
  radar: `radar-beta
    axis a["Speed"], b["Cost"], c["Quality"]
    curve x["Option A"]{1, 2, 3}
    curve y["Option B"]{3, 1, 2}
    max 4`,
  quadrant: `quadrantChart
    title Priorities
    x-axis Low effort --> High effort
    y-axis Low impact --> High impact
    quadrant-1 Quick wins
    quadrant-3 Skip
    Task A: [0.3, 0.8]
    Task B: [0.7, 0.4]`,
  sankey: `sankey-beta
A,B,10
A,C,5
B,D,8`,
  packet: `packet-beta
0-7: "Version"
8-15: "IHL"
16-31: "Total Length"
32-47: "Identification"`,
  classDiagram: `classDiagram
    class Animal {
        +String name
        +int age
        +eat() void
    }
    class Dog
    Animal <|-- Dog : extends
    Dog --> Food : eats`,
  erDiagram: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        string name
        string email PK
    }
    ORDER {
        int id PK
    }`,
  requirement: `requirementDiagram
    requirement test_req {
        id: 1
        text: the system shall work
        risk: high
        verifymethod: test
    }
    element test_entity {
        type: simulation
    }
    test_entity - satisfies -> test_req`,
  C4: `C4Context
    title System Context
    Person(user, "User", "A user of the system")
    System(app, "App", "The main application")
    System_Ext(mail, "Mail", "Email service")
    Rel(user, app, "Uses")
    Rel(app, mail, "Sends email")`,
  block: `block-beta
    columns 3
    a["Front"] b["API"] c["DB"]
    d["Cache"] e["Queue"]
    a --> b
    b --> c`,
  architecture: `architecture-beta
    group api(cloud)[API]
    service db(database)[Database] in api
    service server(server)[Server] in api
    db:L -- R:server`,
  journey: `journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Go upstairs: 3: Me
    section Work
      Do work: 1: Me`,
  mindmap: `mindmap
  root((mindmap))
    Origins
      Long history
    Research
      On effectiveness`,
  zenuml: `zenuml
    title Demo
    A->B: Request
    B-->A: Response
    A->A: self check`,
  kanban: `kanban
  Todo
    [Create docs]
    [Write tests]
  Doing
    [Implement API]
  Done
    [Setup]`,
}

let failures = 0
for (const [name, source] of Object.entries(samples)) {
  const family = findFamily(source)
  console.log(`\n===== ${name} -> ${family ? family.name : "NO MATCH"} =====`)
  if (!family) {
    failures += 1
    continue
  }
  try {
    const output = family.render(source, { width: 100 }).toPlain()
    if (!output.trim()) {
      failures += 1
      console.log("(EMPTY OUTPUT)")
      continue
    }
    console.log(output)
  } catch (error) {
    failures += 1
    console.log("ERROR:", error instanceof Error ? error.message : String(error))
  }
}

console.log(`\n${failures === 0 ? "ALL OK" : `${failures} FAILURE(S)`}`)
