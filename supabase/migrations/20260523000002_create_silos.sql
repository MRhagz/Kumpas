create table silos (
    silo_id text primary key,
    name text not null,
    description text not null
);

insert into silos (silo_id, name, description) values
    ('market_analytics',
     'Market Analytics',
     'PSA OpenSTAT occupational and sector-level employment data. Consumed exclusively by the Academic Auditor agent.'),
    ('live_labor_demand',
     'Live Labor Demand',
     'DOLE BLE Labor Market Information publications and in-demand occupation rankings. Consumed exclusively by the Industry Analyst agent.'),
    ('path_feasibility',
     'Path Feasibility',
     'CHED Memorandum Order scholarship and priority program data plus manually curated TESDA program cost benchmarks. Consumed exclusively by the Feasibility Strategist agent.');
