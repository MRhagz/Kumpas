# 

## **CEBU INSTITUTE OF TECHNOLOGY**

**UNIVERSITY**

COLLEGE OF COMPUTER STUDIES

# 

# 

## 

## 

# **Software Design Description**

## *for*

## Kumpas

**Change History Signature**

| Version | Date | Description | Author(s) |
| ----- | ----- | ----- | ----- |
| 1.0 | May 4, 2026 | Initial release of SDD document | Ewican, Milleza, Muli, Pepino, Rago |

**Preface**

**Table of Contents**

**[1\.](#introduction)**	[**Introduction	6**](#introduction)

[1.1.	Purpose	6](#purpose)  
[1.2.	Scope	6](#scope)  
[1.3.	Definitions and Acronyms	6](#definitions-and-acronyms)  
[1.4.	References	6](#references)

[**2\.**	**Architectural Design	7**](#architectural-design)

[**3\.**	**Detailed Design	8**](#detailed-design)

[*Module 1	8*](#module-1)  
[*Module 2	9*](#module-2)

1. # **Introduction** {#introduction}

   1. ## ***Purpose*** {#purpose}

This document is the Software Design Document (SDD) for Kumpas, an explainable multi-agent career alignment system designed to support guidance counselors in Philippine high schools. The system addresses the chronic underutilization of student academic assessment data, specifically National Career Assessment Examination (NCAE) results, National Achievement Test (NAT) scores, and Form 137 grade records, by automating their extraction, synthesis, and application in career pathway recommendations.

This SDD is intended for the development team, the software engineering advisor, cooperating guidance counselors who will serve as primary users, and school administrators who will authorize deployment. It defines the complete functional and non-functional requirements that will govern system development.

2. ## ***Scope*** {#scope}

Kumpas is a web-based application engineered to assist school guidance counselors in conducting data-driven career alignment sessions. It is designed to support Grade 10 students in selecting both their Senior High School (SHS) tracks and their long-term career paths, as well as current SHS students planning their transition into higher education or the workforce. The system accepts four types of input: an uploaded photograph of the student's Form 137 or NCAE result sheet or NAT score sheet and counselor-encoded session notes across five structured fields (Career Goal, Personal Interests and Strengths, Family and Financial Situation, Concerns and Red Flags, and Counselor's Overall Impression).

From these inputs, the system performs the following core functions:

* **Knowledge Base Population:** Periodic acquisition of Philippine labor market data through three documented tiers: operator-curated CSV exports fromPSA OpenSTAT for Labor Force Survey occupational data (downloaded manually each quarter because PSA portals are behind a CDN that blocks non-browser clients), automated PDF parsing of publicly downloadable DOLE BLE LMI reports and CHED Memorandum Orders, and manually curated TESDA program cost records. All records are stored in a structured, timestamped vector store that serves as the sole factual foundation for all agent-generated recommendations.

* **Multimodal Processing:** Automated academic document parsing featuring strict personally identifiable information (PII) redaction prior to data processing.

* **Data Verification:** Structured academic data extraction coupled with a mandatory counselor-facing confirmation interface to ensure data integrity before analysis.

* **Agentic Analysis:** A three-agent career analysis pipeline utilizing a Federated Retrieval-Augmented Generation (RAG) architecture, strictly maintaining decoupled knowledge silos (Market Analytics, Live Labor Demand, and Path Feasibility).

* **Explainable Output:** Generation of career recommendations utilizing Chain-of-Thought (CoT) reasoning to produce a transparent, logical audit trail.

* **Reporting:** Automated compilation of a downloadable PDF report detailing recommendations for students.

The system is intended exclusively for use by licensed guidance counselors. Grade 10 and SHS students are the indirect beneficiaries. The system does not replace human counselors; it provides a structured, evidence-based instrument to support their advisory decisions. All AI inference is handled through a secure external API, and no student-identifiable data is transmitted to external servers in compliance with the Data Privacy Act of 2012 (R.A. 10173).

3. ## ***Definitions and Acronyms*** {#definitions-and-acronyms}

| Term / Acronym | Definition |
| ----- | ----- |
| NCAE | National Career Assessment Examination \- a mandatory, DepEd-administered aptitude test for Filipino Grade 9 or 10 students (K-12 program) that helps identify their aptitude and occupational interests. It provides guidance for choosing Senior High School (SHS) tracks (Academic, TVL, Sports, Arts) and post-secondary courses to reduce job mismatch. |
| NAT | National Achievement Test \- a standardized, DepEd-administered examination in the Philippines designed to evaluate the academic proficiency of students at key stages (Grades 3, 6, 10, and 12). It measures mastery in core subjects to determine educational quality, school performance, and curriculum effectiveness rather than to rank individual students. |
| Form 137 | An official document in the Philippines that contains a learner's comprehensive academic, personal, and behavioral history from elementary to secondary school. It includes yearly grades, attendance, and a certificate of transfer, and is essential for transferring schools or enrolling in college. |
| SHS | Senior High School \- refers to the final two years of mandatory basic education—Grades 11 and 12—introduced under the K to 12 program (Republic Act 10533). It acts as a specialized, two-year preparatory stage that equips students for higher education, employment, or entrepreneurship through specialized academic or technical tracks. |
| RAG | Retrieval-Augmented Generation \- an AI architecture that grounds large language model outputs in dynamically retrieved, external knowledge documents to reduce hallucination. |
| LLM | Large Language Model \- a deep learning model trained on large text corpora capable of natural language understanding and generation, used as the AI backbone of the system. |
| CoT | Chain-of-Thought \- a prompting technique that instructs an LLM to generate explicit step-by-step reasoning before producing a final answer, making the model's logic observable. |
| XAI | Explainable Artificial Intelligence \- AI approaches that produce human-understandable justifications for their outputs, enabling users to verify and trust AI-generated decisions. |
| PII | Personally Identifiable Information \- any data that could be used to identify a specific individual, such as full names, birthdates, and ID numbers. |
| OCR | Optical Character Recognition \- a technology that converts images of text into machine-readable text strings. |
| MAS | Multi-Agent System \- a system composed of multiple autonomous AI agents that collaborate to solve tasks beyond the capability of any single agent. |
| Federated RAG | A RAG architecture that partitions knowledge into isolated silos, each serving exclusively as the retrieval context for one designated specialist agent, preventing cross-domain contamination. |
| Cross-Silo Bleed Rate | A metric measuring the percentage of retrieved documents in an agent's context that originate from a knowledge silo not assigned to that agent. Target is below 5%. |
| RAGAS | Retrieval-Augmented Generation Assessment \- a framework providing automated metrics (Context Precision, Faithfulness) for evaluating RAG pipeline performance. |
| EQI-R | Explanation Quality Index Rubric \- a 1 to 5 scale rubric evaluating AI explanations across contrastiveness, selectivity, social calibration, and evidence traceability. |
| SUS | System Usability Scale \- a standardized 10-item questionnaire measuring perceived usability of a system, with scores above 68 considered above average. |
| TAM | Technology Acceptance Model \- a validated model measuring perceived usefulness and perceived ease of use as predictors of user adoption intention. |
| PSA  | Philippine Statistics Authority \- the national government agency that produces the Labor Force Survey and other official statistical publications.  |
| OpenSTAT  | PSA's open data portal (openstat.psa.gov.ph) that provides publicly downloadable structured datasets, including occupational employment data by sector.  |
| DOLE  | Department of Labor and Employment \- the national agency mandated to regulate labor and publish Labor Market Information for the Philippines.  |
| BLE  | Bureau of Local Employment \- the DOLE bureau responsible for producing and publishing LMI reports and maintaining the PhilJobNet portal.  |
| LMI  | Labor Market Information \- structured data on employment trends, in-demand occupations, and sector-level job demand published periodically by DOLE BLE.  |
| CMO  | CHED Memorandum Order \- official policy documents published by CHED that specify priority degree programs, scholarship eligibility criteria, and benefit amounts for a given academic year.  |
| DepEd | Department of Education \- the Philippine government agency responsible for the K to 12 Basic Education Program. |
| CHED | Commission on Higher Education \- the Philippine government agency overseeing tertiary education and scholarship programs. |
| TESDA | Technical Education and Skills Development Authority \- the Philippine government agency overseeing technical-vocational qualifications and scholarship programs. |
| SDD | System Design Document \- the technical design document that follows approval of this SRS and details the system architecture and implementation plan. |
| MVP | Minimum Viable Product \- the first deployable version of the system containing all core features required for initial evaluation with users. |
| JWT | JSON Web Token: a signed token issued by Supabase Auth and used by the application to identify the authenticated counselor in server-side requests and RLS checks. |
| RLS  | Row-Level Security: a PostgreSQL and Supabase authorization mechanism that restricts table rows by the authenticated user or service role. |

   4. ## ***References*** {#references}

The following documents and studies were referenced in defining the requirements of this system:

Kilag, O. K., Dacanay, L., Hubahib Jr., S., Najarro, P. A., Uy, F., & Rabi, J. I. I. (2024). The state of guidance counseling in Philippine education. International Multidisciplinary Journal of Research for Innovation, Sustainability, and Excellence (IMJRISE), 1(5), 7–12. https://risejournals.org/index.php/imjrise/article/view/331

Fernandez, C. B., Balijon, M. B., & Ancho, I. V. (2023). Career preferences of Filipino senior high school students. CTU Journal of Innovation and Sustainable Development, 15(3), 81–91. https://doi.org/10.22144/ctujoisd.2023.053

Quintos, C. A., Caballes, D. G., Gapad, E. M., & Valdez, M. R. (2020). Exploring between SHS strand and college course mismatch: Bridging the gap through school policy on intensified career guidance program. CiiT International Journal of Data Mining and Knowledge Engineering, 12(10–12), 156–161.

Huang, L., Yu, W., Ma, W., Zhong, W., Feng, Z., Wang, H., Chen, Q., Peng, W., Feng, X., Qin, B., & Liu, T. (2025). A survey on hallucination in large language models: Principles, taxonomy, challenges, and open questions. ACM Transactions on Information Systems, 43(2), 1–55. https://doi.org/10.1145/3703155

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., Küttler, H., Lewis, M., Yih, W., Rocktäschel, T., Riedel, S., & Kiela, D. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. Advances in Neural Information Processing Systems, 33, 9459–9474.

Miller, T. (2019). Explanation in artificial intelligence: Insights from the social sciences. Artificial Intelligence, 267, 1–38. https://doi.org/10.1016/j.artint.2018.07.007

Republic of the Philippines. (2012). Republic Act No. 10173: Data Privacy Act of 2012\. National Privacy Commission. https://www.privacy.gov.ph/data-privacy-act/

Department of Education, Republic of the Philippines. (2016). Policy guidelines on the national assessment of student learning for the K to 12 basic education program (DepEd Order No. 55, s. 2016). https://www.deped.gov.ph/wp-content/uploads/2016/06/DO\_s2016\_55-3.pdf

Es, S., James, J., Espinosa Anke, L., & Schockaert, S. (2024). RAGAs: Automated evaluation of retrieval augmented generation. In Proceedings of the 18th Conference of the European Chapter of the Association for Computational Linguistics: System Demonstrations (pp. 150–158). https://doi.org/10.18653/v1/2024.eacl-demo.16

Brooke, J. (1996). SUS: A “quick and dirty” usability scale. In P. W. Jordan, B. Thomas, B. A. Weerdmeester, & I. L. McClelland (Eds.), Usability evaluation in industry (pp. 189–194). Taylor and Francis.

Davis, F. D. (1989). Perceived usefulness, perceived ease of use, and user acceptance of information technology. MIS Quarterly, 13(3), 319–340. https://doi.org/10.2307/249008

Philippine Statistics Authority. (2024). Labor Force Survey, July 2024\. PSA.

De Leon, P. J. (2025). The influence of socioeconomic factors on career choices among senior high school graduates: A tracer study. International Journal of Progressive Research in Engineering Management and Science, 5(5), 1252–1262.

2. # **Architectural Design** {#architectural-design}

![][image1]

***2.1 System Architecture Overview***

Kumpas uses a web-based architecture centered on a counselor-facing Next.js application deployed on Vercel. The application coordinates document intake, redaction, AI extraction, multi-agent analysis, and report generation. Supabase provides persistent storage for knowledge-base records, vector embeddings, ingestion logs, correction logs, session drafts, and any configured report artifacts. Gemini provides multimodal extraction and language-model analysis through authenticated HTTPS API calls.

***2.2 Deployment View***

The deployed system consists of the following units:

* **Next.js/Vercel application:** counselor UI, protected API routes, report generation route, session orchestration, and Gemini/Supabase coordination.  
* **Supabase project:** PostgreSQL database, pgvector indexes, RLS policies, storage buckets if generated PDFs or temporary redacted files are stored outside the request lifecycle.  
* **Gemini API:** external AI provider used only after PII redaction.  
* **Ingestion scheduler/worker:** GitHub Actions workflows responsible for knowledge base population. DOLE BLE / CHED PDF ingestion runs on a scheduled cron; PSA OpenSTAT CSV ingestion and TESDA program cost ingestion run on push triggers when the development team commits a refreshed CSV.

***2.3 Runtime View for a Counseling Session***

1\. Counselor authenticates.

2\. Counselor uploads documents and enters notes.

3\. The system redacts PII before external AI processing.

4\. Unredacted raw images are deleted immediately after redaction succeeds.

5\. Redacted inputs are sent to Gemini for extraction.

6\. Counselor reviews and approves extracted data.

7\. Approved profile and session state are saved to the durable session store.

8\. Specialist agents retrieve only their assigned knowledge silos.

9\. The meta-agent ranks recommendations.

10\. The report is generated and delivered according to the report-storage design.

11\. Session cleanup removes temporary artifacts according to retention rules.

***2.4 Data Location and Privacy View***

| Artifact | Storage Location | Contains PII? | Sent to Gemini? | Retention | Deletion Trigger |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Raw uploaded image | Temporary server storage only | Yes | No | Until redaction succeeds | Immediate post-redaction purge |
| Redacted image | Temporary storage or Supabase Storage | No direct PII expected | Yes | Session/report window only | Session cleanup or expiry |
| Extracted fields | Durable session store | Possible | Yes, only if redacted/minimized | 24 hours for drafts unless approved policy differ | Draft expiry/session cleanup |
| Counselor notes | Durable session store | Possible | Yes, if needed for analysis | 24 hours for drafts unless approved policy differs | Draft expiry/session cleanup |
| Correction logs | Supabase table | No student-identifiable data | No | One academic year | Retention cleanup |
| Generated PDF | Streamed response or Supabase Storage | Possible | No | Up to 24 hours | Retention cleanup |
| Knowledge-base chunks | Supabase pgvector tables | No student PII | Retrieved as context | Until superseded | Ingestion maintenance |
| RankedRecommendations  | Supabase table  | No direct PII; contains career path names, alignment scores, and status flags derived from the approved student profile  | No  | Session/report window only; records correspond to a single counseling session  | Session cleanup or retention cleanup after report delivery  |
| RecommendationSources  | Supabase table  | No direct PII; contains knowledge-base source references linked to ranked recommendations  | No  | Session/report window only; tied to the lifecycle of its parent RankedRecommendations record  | Session cleanup or retention cleanup after report delivery; must be deleted in the same pass as the parent RankedRecommendations record to avoid orphaned rows  |

***2.5 Cross-Cutting Concerns***

Authentication, authorization, row-level security, session expiry, logging, retry policies, quota handling, backup, and disaster recovery apply across all modules. Each detailed module design shall reference these shared mechanisms rather than redefining local-only behavior.

***2.6 Authentication and Authorization Design***

The system mandates authenticated sessions for all counselor-facing web interfaces. Authentication is handled exclusively via Supabase Auth. 

**User Provisioning (Counselor Role)** The system supports a single user role for the web application: the Counselor. Accounts are strictly invite-only. The provisioning flow is as follows: the development team manually creates the user account, Supabase automatically emails an invitation, and the counselor follows the secure link to set their password and activate the account.

**Administrative and Ingestion Access.** Automated backend processes, such as GitHub Actions ingestion workflows and server-side routes that require elevated database access, authenticate to Supabase using the service-role key. This key bypasses Row Level Security and has full write access to the vector store tables. It must be stored exclusively in two locations: as an encrypted GitHub Actions repository secret for use by the ingestion workflows, and as a Vercel environment variable for server-side routes that require service-role access such as PDFFileStore. The service-role key must never appear in client-side code, in any committed file, or in any environment other than these two designated locations. Ingestion workflows do not use a counselor JWT or any session token. 

**Row-Level Security (RLS)** Authorization and data isolation are strictly enforced at the database level using two core Supabase RLS policies:

* **Profiles:** Counselors may only access and update their own specific profile row.  
* **Session-Scoped Tables:** For all operational tables, database operations are restricted so that users can only interact with records where the counselor\_id matches their authenticated user token (auth.uid()).

3. # **Detailed Design** {#detailed-design}

### ***Module 1*** {#module-1}

#### ***1.1 PSA OpenSTAT CSV Ingestion***

* Design Constraint

The PSA data portals (psa.gov.ph, openstat.psa.gov.ph, and the related data.gov.ph CKAN portal) sit behind a content delivery network that returns HTTP 403 to non-browser clients across all observed endpoints, including statistical-table file attachments, the PX-Web JSON API, and the PX-Web user interface. Scheduled CI fetch of PSA Labor Force Survey CSVs is therefore not feasible without a browser session cookie or a sanctioned PSA data-sharing arrangement. As a consequence, Module 1.1 is structured as an operator-curated CSV pipeline rather than a fully automated download pipeline: the development team manually downloads each quarterly LFS release through a real browser, normalizes its columns to the canonical schema, and commits the cleaned CSV into the repository; pushing that file triggers the ingestion workflow. The pipeline records carry \`acquisition\_method \= operator\_curated\_csv\` for audit trail purposes — semantically distinct from \`manual\_curation\` (Module 1.3 TESDA), because PSA records originate from official PSA exports rather than hand-authored values. If PSA later publishes a sanctioned data-sharing API, or if the team adopts a proxy source such as the ILO ILOSTAT API, the pipeline can be reverted to a fully automated \`automated\_csv\` flow with only a workflow-trigger and source-URL change.

* User Interface Design

Not applicable. Not applicable. This module is a backend pipeline triggered by a repository push to the designated PSA CSV path. There is no counselor-facing or administrator-facing interface involved in its execution; it operates entirely in the background without any human interaction during a run. Any status it produces is surfaced elsewhere in the counselor interface as a read-only ingestion timestamp.

* Front-end component(s)

Not applicable. The ingestion timestamp updated by this pipeline is consumed by the counselor interface in a separate display component that belongs to Module 5 (Session Orchestration), not to this module itself. 

* Back-end component(s)

  * **PushTriggerWorkflow**

    * **Description and purpose:** Triggers the PSA OpenSTAT ingestion workflow when the development team commits a refreshed quarterly LFS CSV to the designated repository path. The trigger is a GitHub Actions workflow configured with a path-scoped push trigger plus a manual \`workflow\_dispatch\` re-run, replacing the originally specified cron schedule because the PSA portals block non-browser clients (see Design Constraint above). Each run records start time, end time, status, and failure reason in the ingestion log.

    * **Component type/format:** GitHub Actions workflow on \`push\` to \`ingestion/data/psa/\*\*\` paths, invoking the Python ingestion job..

  * **OperatorCuratedCSVReader**

    * **Description and purpose:** Loads the raw bytes of the operator-curated CSV from the GitHub Actions runner's checked-out working copy. The source location is provided via the \`PSA\_OPENSTAT\_URL\` environment variable, which the workflow sets to a \`file://\` path inside the runner. The same reader also supports HTTPS URLs (unused in the default Option A flow) so the pipeline can later switch to an automated source — for example, a sanctioned PSA data-sharing endpoint or an ILO ILOSTAT proxy — without rewriting the data path. On HTTPS failure (non-200 response or unreachable host) it raises a download-failure event to the logger.

    * **Component type/format:** Python service class using httpx with a file:// shortcut for local CSV reads.

  * **LFSCSVParser** 

    * **Description and purpose:** Receives the raw CSV bytes from the client and loads them into a structured DataFrame using `pandas`. Handles encoding issues, malformed rows, and column normalization.

    * **Component type/format:** Python utility class wrapping `pandas.read_csv`.

  * **OccupationRecordExtractor** 

    * **Description and purpose:** Reads the parsed DataFrame and extracts occupation-sector employment records into a normalized list of domain objects. Applies column mapping and filters out incomplete or irrelevant rows.

    * **Component type/format:** Python utility class; pure data transformation logic with no I/O side effects.

  * **TextChunker**

    * **Description and purpose:** Converts each `OccupationRecord` into one or more text chunks suitable for embedding. Each chunk carries provenance metadata (source URL, acquisition method, ingestion timestamp) so that the vector store record is fully attributable.

    * **Component type/format:** Python utility class with configurable `chunk_size` and `overlap` parameters.

  * **EmbeddingService** 

    * **Description and purpose:** Embeds each text chunk into a 768-dimensional vector by calling the Gemini \`gemini-embedding-001\` model via the Google AI REST API, with outputDimensionality=768 and taskType=RETRIEVAL\_DOCUMENT. The Google AI REST API is used directly (no local model is loaded inside the GitHub Actions runner) so cold-start cost is bounded and the ingestion runner image stays minimal. Identical model name, output dimensionality, and embedding-space semantics are required across Modules  1.1, 1.2, 1.3, and 3.1; any change here must be applied to the query-side QueryEmbeddingService in the same release.

    * **Component type/format:**  Python service class issuing authenticated HTTPS requests to the Gemini embedding endpoint via httpx

  * **VectorStoreRepository**

    * **Description and purpose:** Handles all write operations to the Supabase `pgvector`\-enabled PostgreSQL instance. It performs upsert operations on the composite primary key (silo\_id, source\_url, chunk\_index). If a record with the same (silo\_id, source\_url, chunk\_index) already exists and its content\_hash is unchanged, the record is skipped (no re-embedding, no write). If the content\_hash has changed, the existing record is updated with the new embedding and new ingestion\_timestamp. If no matching key exists, a new record is inserted. content\_hash (SHA-256 of the raw chunk text) is stored as a non-key column for change detection only. It is never used as the primary lookup key. silo\_id is a foreign key to the silos reference table, ensuring that a record can never be written to the wrong silo due to a source\_type misconfiguration.

    * **Component type/format:** Python data access class using supabase-py and psycopg2 where needed. Credentials are provided through GitHub Actions secrets or the Python backend deployment environment, never hard-coded in the repository.

  * **IngestionLogger** 

    * **Description and purpose:** Because ingestion runs from GitHub Actions, each workflow run shall write structured success, no-op, and failure records to the ingestion log. Failures shall also be visible in the GitHub Actions run history and sent to the configured administrator alert channel.

    * **Component type/format:** Python logging service writing to the configured the ingestion\_logs Supabase table specified in 3.3 Data Retention. and GitHub Actions workflow logs; alerts are dispatched through email, webhook, or another configured channel.

    

* Object-Oriented Components

  * Class Diagram

![][image2]

* Sequence Diagram

![][image3]

* Data Design

  * ERD or schema

![][image4]

#### ***1.2 DOLE BLE / CHED PDF Parsing & Ingestion***

* Design Constraint

Module 1.2 is implemented as a hybrid pipeline because the two underlying publication portals have different access characteristics. The CHED Memorandum Order index on the legacy WordPress mirror (legacy.ched.gov.ph/{year}-ched-memorandum-orders/) responds normally to non-browser clients and exposes a stable per-year HTML listing of CMO PDFs, so the CHED side runs as the originally specified fully automated weekly cron pipeline (`acquisition_method = automated_pdf`, silo \= path\_feasibility). The DOLE Bureau of Local Employment portal (ble.dole.gov.ph) sits behind the same class of CDN that returns HTTP 403 to non-browser clients across both index pages and PDF attachments — the same root cause that forced the operator-curated CSV pivot in Module 1.1 for PSA OpenSTAT. Scheduled CI fetch of BLE LMI PDFs is therefore not feasible without a browser session cookie or a sanctioned DOLE data-sharing arrangement. The DOLE side is consequently structured as an operator-curated PDF pipeline rather than an automated download: the development team manually downloads each BLE LMI release through a real browser, commits the file (and an optional .meta.json sidecar carrying the official source URL and publication date) into ingestion/data/dole\_ble/, and pushing that file triggers the ingestion workflow. Pipeline records carry acquisition\_method \= operator\_curated\_pdf for audit-trail purposes — semantically distinct from `automated_pdf` (CHED, automated scrape) and from manual\_curation (Module 1.3 TESDA, hand-authored values), because DOLE BLE records originate from official BLE PDF publications and only the delivery path is manual. If DOLE later publishes a sanctioned data-sharing endpoint, or if the team adopts a proxy source, the DOLE side can be reverted to a fully automated `automated_pdf` flow with only a workflow-trigger and source-URL change. 

* User Interface Design

Not applicable. This module is a fully automated, scheduler-driven backend pipeline that operates entirely outside of active counseling sessions. It requires no counselor or end-user interaction. Like Module 1.1, its only output visible to the counselor is the updated ingestion timestamp displayed in the counselor interface, which is rendered by a separate read-only display component in Module 5\. 

* Front-end component(s)

This module is a backend pipeline that operates entirely outside of active counseling sessions. It requires no counselor or end-user interaction. Like Module 1.1, its only output visible to the counselor is the updated ingestion timestamp displayed in the counselor interface, which is rendered by a separate read-only display component in Module 5\.

* Back-end component(s)

  * **WeeklyScheduler (CHED Side)**

    * **Description and purpose:** Triggers the CHED Memorandum Order ingestion workflow according to the configured schedule. The trigger is a GitHub Actions cron workflow (weekly, Monday 02:00 UTC by default) that starts the Python ingestion job, asks \`PublicationIndexChecker\` for the current yearCMO listing on \`legacy.ched.gov.ph\`, and exits as a no-op when no new publications are detected.

    * **Component type/format:** GitHub Actions cron workflow invoking the Python ingestion job.

  * **OperatorCuratedDolePushTrigger (DOLE BLE side)**

    * **Description and purpose:** Triggers the DOLE BLE LMI ingestion workflow when the development team commits a refreshed BLE LMI PDF (and optional \`\<filename\>.meta.json\` sidecar) to \`ingestion/data/dole\_ble/\`. Replaces the originally specified weekly cron because \`ble.dole.gov.ph\` blocks non-browser clients (see Design Constraint above). Each run records start time, end time, status, and failure reason in the ingestion log. A manual \`workflow\_dispatch\` re-run is also exposed for ad-hoc triggers without a new commit.

    * 

    * **Component type/format:** GitHub Actions cron workflow invoking the Python ingestion job.

  * **PublicationIndexChecker** 

    * **Description and purpose:** Queries the CHED publication index page at \`legacy.ched.gov.ph/{year}-ched-memorandum-orders/\` to enumerate the CMO PDFs published in a target year. It returns the list of \`(publication\_url, cmo\_number, year, title)\` tuples; the pipeline compares these against a local cache of previously processed publication URLs (\`publication\_index\_cache\`) to determine which ones are new. On a first run (empty cache) a configurable cap (default 10\) bounds the number of publications processed, so the initial backfill is predictable and cheap. If none are new, it signals a no-op and the pipeline terminates without modifying the vector store. DOLE BLE intentionally does not use this checker because the BLE site is CDN-blocked; for DOLE, change detection is replaced by the path-scoped push trigger above.

    * **Component type/format:** Python service class; uses \`httpx\` for HTTP requests and \`BeautifulSoup\` to parse the WordPress index DOM (\`\<div class="entry-content"\> \<table\> \<tr\>\<td\>\<a href="\*.pdf"\>CMO No. N, series of YYYY – ...\`).

  * **PDFDownloader** 

    * **Description and purpose:** Downloads a PDF document over HTTPS from a given publication URL. On failure, it raises a typed exception that the pipeline catches and routes to the logger. Does not perform any extraction or transformation.

    * **Component type/format:** Python utility class using `httpx` with streaming support for large PDF files.

  * **PDFTextExtractor** 

    * **Description and purpose:** Accepts raw PDF bytes and extracts all page text using pdfplumber. Handles multi-column layouts, running headers/footers, and hyphenation artifacts through pdfplumber’s spatial-layout-aware extraction. This library was chosen over Node.js alternatives (pdf-parse, pdfjs-dist) because neither handles multi-column Philippine government publications reliably. Module 1 must remain a Python service in part to preserve this capability.

    * **Component type/format:** Python utility class wrapping pdfplumber.open().

  * **TextCleaner** 

    * **Description and purpose:** Post-processes the raw extracted text by detecting and removing headers, footers, and page-number artifacts using pattern matching and heuristic line-length filters. Produces clean, paragraph-level text ready for chunking.

    * **Component type/format:** Python utility class with regex-based cleaning rules configurable per source type (DOLE vs CHED).

  * **TextChunker** 

    * **Description and purpose:** Splits cleaned text into overlapping chunks of a fixed token length, preserving sentence boundaries where possible. Each chunk is paired with provenance metadata derived from the source publication.

    * **Component type/format:** Python utility class; shared with Module 1.1 through a common `chunking` utility module.

  * **EmbeddingService** 

    * **Description and purpose:** Converts each text chunk into a 768-dimensional vector using the same gemini-embedding-001 hosted call as Module 1.1, with identical \`outputDimensionality\` and \`taskType=RETRIEVAL\_DOCUMENT\`. Reusing the exact configuration is required to keep all knowledge silos in the same embedding space.

    * **Component type/format:**  Python service class; shared with Modules 1.1 and 1.3 through the same EmbeddingService implementation

  * **VectorStoreRepository** 

    * **Description and purpose:** Upserts embedded chunks into the appropriate Supabase knowledge silo — Live Labor Demand for DOLE BLE LMI records, and Path Feasibility for CHED Memorandum Order records — based on a `source_type` tag attached to each chunk's metadata. Updates the ingestion timestamp for the affected silo after a successful batch.

    * **Component type/format:** Python data access class using `supabase-py`; silo routing is determined by the `source_type` field in chunk metadata.

  * **PublicationIndexCache** 

    * **Description and purpose:** Maintains a record of all publication URLs that have been successfully ingested, enabling the `PublicationIndexChecker` to perform change detection without re-downloading already-processed documents. Stored in a Supabase table.

    * **Component type/format:** PostgreSQL table accessed via `VectorStoreRepository`; effectively acts as an idempotency guard.

  * **IngestionLogger** 

    * **Description and purpose:** Records run outcomes per publication, logs no-op runs, and dispatches administrator alerts on download or parsing failures.

    * **Component type/format:** Python service class; shared with Module 1.1.

* Object-Oriented Components

  * Class Diagram

![][image5]  

* Sequence Diagram

![][image6]

* Data Design

  * ERD or schema

![][image7] 

#### ***1.3 Manual TESDA Cost Curation & Ingestion***

* User Interface Design

Not applicable within the main Kumpas counselor application. The curation process for the development team is entirely repository-based. The team manually edits and commits a structured CSV file directly within the project's version control repository. This process exists strictly outside the scope of the counselor-facing application and is not deployed as part of the Kumpas web interface.

* Front-end component(s)

Not applicable. The administrator interacts with the system by submitting a validated CSV or JSON file conforming to the TESDA record schema. No browser-rendered form is part of this module's design in the main application. 

* Back-end component(s)

  * **RepoCsvCurationWorkflow**

    * **Description and purpose:** Entry point for the manual curation process. The development team invokes this component — either via a CLI command or a secure admin API endpoint — to begin the ingestion of a prepared batch of TESDA program cost records. It reads the batch file path or payload and passes it downstream.

    * **Component type/format:** GitHub Actions workflow triggered by a push to the designated TESDA CSV path; authenticated to Supabase via service-role repo  secret.

  * **TESDARecordValidator** 

    * **Description and purpose:** Validates each submitted TESDA record against a defined schema: required fields must be present (program name, cost, tuition benchmark, TESDA qualification code, source reference), numeric fields must be in acceptable ranges, and the source reference must be a non-empty string. Invalid records are flagged with field-level error messages and returned to the administrator for correction before any embedding or upsert occurs. No partial batches are written to the vector store.

    * **Component type/format:** Python utility class using  `pydantic` for schema definition and validation.

  * **TESDARecordSchema (Pydantic Model)** 

    * **Description and purpose:** Defines the canonical structure and validation rules for a single TESDA program cost record. Acts as the contract between the administrator's curation template and the ingestion pipeline.

    * **Component type/format:** Python `pydantic.BaseModel` data class.

  * **EmbeddingService** 

    * **Description and purpose:**  Embeds each TESDA text chunk through the same \`gemini-embedding-001\` call used in Modules 1.1 and 1.2, with identical \`outputDimensionality=768\` and \`taskType=RETRIEVAL\_DOCUMENT\`, so manually curated TESDA records occupy the same embedding space as the rest of the Path Feasibility silo.

    * **Component type/format:** Python service class; shared implementation with Modules 1.1 and 1.2.

  * **VectorStoreRepository** 

    * **Description and purpose:** Upserts embedded TESDA records into the Path Feasibility knowledge silo in Supabase. Performs conflict resolution on a composite key of `tesda_qualification_code` \+ `program_name` to prevent duplicate entries across semester refresh cycles. Updates the ingestion timestamp for the Path Feasibility silo after a successful batch.

    * **Component type/format:** Python data access class; shared with Modules 1.1 and 1.2.

  * **ValidationReporter** 

    * **Description and purpose:** Produces a structured validation report after the validator runs, listing all records that failed validation along with the specific fields that caused failure. This report is printed to the administrator's terminal or written to a report file so corrections can be made before re-submitting.

    * **Component type/format:** Python utility class; formats output as a human-readable table using `tabulate` or as a JSON file.

  * **IngestionLogger** 

    * **Description and purpose:** Records the result of the curation ingestion run, including the number of records validated, the number successfully upserted, and any validation or write errors. Also marks the run with the acquisition method flag `manual_curation` for audit trail purposes.

    * **Component type/format:** Python service class; shared with Modules 1.1 and 1.2.

* Object-Oriented Components

  * Class Diagram

![][image8]  

* Sequence Diagram

![][image9]

* Data Design

  * ERD or schema

  ![][image10]

.

### ***Module 2*** {#module-2}

#### ***2.1 Document Intake and Automatic Redaction***

* User Interface Design

![][image11]

* Front-end component(s)

  * **DocumentUploadPanel** 

    * **Description and purpose:** A drag-and-drop and file-picker upload surface that accepts image files (JPEG, PNG) representing up to three document types: Form 137, NCAE result sheet, and NAT score sheet. The panel renders a distinct upload zone for each document type. Its purpose is to give the guidance counselor a single, clearly labeled screen through which all student documents enter the system without requiring command-line access or technical knowledge. The panel enforces file-type validation and maximum file-size constraints client-side before any network request is made. 

    * **Component type or format:** React Functional Component 

  * **SessionNotesForm** 

    * **Description and purpose:** A structured multi-field form that collects the counselor's qualitative observations across five defined fields: Career Goal, Personal Interests and Strengths, Family and Financial Situation, Concerns and Red Flags, and Counselor's Overall Impression. Each field is an auto-expanding textarea with a character counter. Eahc field is strictly required.

    * **Component type or format:** React Controlled Form Component 

  * **UploadStatusIndicator** 

    * **Description and purpose:** A status strip rendered beneath the DocumentUploadPanel that communicates the processing state of each uploaded document through sequential status tags: Uploading → Received → Redacting PII → Redaction Complete → Ready for Extraction. If any document fails redaction, a dismissible error banner with a retry action is surfaced. 

    * **Component type or format:** React Stateful Component with Server-Sent Events (SSE)  

* Back-end component(s)

  * **FileUploadController** 

    * **Description and purpose:** An HTTP request handler that receives multipart file uploads, validates content type and file size, assigns a unique document ID, writes the raw image to temporary storage, and enqueues a redaction job. The HTTP response returns immediately with a `202 Accepted` while redaction runs asynchronously. 

    * **Component type or format:** Next.js API Route Handler (App Router)

  * **PIIRedactionService**

    * **Description and purpose:** An asynchronous worker that consumes redaction jobs from the message queue and applies PII removal to raw document images. It uses named-entity recognition and regex pattern matching to detect student names, birthdates, and ID numbers, then overwrites detected regions with opaque black rectangles.

    On successful redaction: the redacted image is passed to DocumentStorageService for storage; the original raw image is immediately and permanently deleted from /tmp by invoking RawImagePurger before any other operation proceeds; the document record is updated to REDACTION\_COMPLETE; and a status event is pushed to the frontend. The raw image deletion is non-optional and non-deferrable — it must complete synchronously before the redacted image path is returned to the pipeline.

    On redaction failure: the raw image is also immediately deleted. A failed redaction must never leave a raw image on disk.

    * **Component type or format:**  Asynchronous Background Worker Service 

  * **DocumentStorageService** 

    * **Description and purpose:** A utility service that abstracts all file I/O for both raw and redacted document images. It exposes three operations: store raw, store redacted, and retrieve redacted. Raw images are never exposed through any public-facing API route, ensuring unredacted originals cannot reach the extraction pipeline. 

    * **Component type or format:**  Singleton Service Class (Dependency-Injected) 

  * SessionInitializationService 

    * **Description and purpose:** A service responsible for creating and persisting a new counseling session record when a counselor begins a session. It generates the session ID, records the counselor's identity, sets the initial session status, and coordinates the creation of the linked session notes record once the form is submitted. 

    * **Component type or format:**  Service Layer Class (Repository Pattern)

* Object-Oriented Components

  * Class Diagram

![][image12] 

* Sequence Diagram

![][image13]

* Data Design

  * ERD or schema

![][image14]

#### 

#### 

#### 

#### 

#### 

#### 

#### ***2.2 Al Extraction and Counselor Confirmation***

* User Interface Design

![][image15]

* Front-end component(s)

  * **ExtractionResultsPanel** 

    * **Description and purpose:** A read-only tabbed display that presents all AI-extracted field values organized by document type. The Form 137 tab shows a subject-grade grid, the NCAE tab shows strand subscores, and the NAT tab shows subject-area breakdowns. The counselor cannot edit any value in this panel. Its sole purpose is to give the counselor a clear, organized view of what the system successfully extracted from the uploaded documents. If no document was uploaded for a given tab, that tab is visibly marked as unavailable. 

    * **Component type or format:** React Read-Only Tabbed Display Component 

  * **EditableFieldForm** 

    * **Description and purpose:** A WYSIWYG rich-text editor panel where the counselor types and formats their session notes across five structured fields: Career Goal, Personal Interests and Strengths, Family and Financial Situation, Concerns and Red Flags, and Counselor's Overall Impression. Each field is rendered as an independent WYSIWYG editor block, allowing the counselor to apply basic formatting such as bold, italics, and bullet lists. All five fields are mandatory and must contain input before the analysis can be triggered. The values entered here serve as the qualitative data stream passed to the analysis agents alongside the extracted academic data. 

    * **Component type or format:** React WYSIWYG Editor Component

  * **ConfirmationApprovalBar** 

    * **Description and purpose:** A bottom action bar containing a single primary "Begin Multi Agent Analysis" button. The button remains disabled and visually dimmed until all five counselor notes fields contain at least some text input. Uploaded documents are optional and their presence or absence does not affect whether the button activates. Once clicked, the bar disables itself, shows a loading state, and dispatches the assembled student profile to the analysis pipeline. Its purpose is to act as the deliberate trigger gate that separates the data preparation phase from the multi-agent analysis phase. 

    * **Component type or format:** React Action Bar Component with Form Validation State 

* Back-end component(s)

  * **GeminiExtractionService** 

    * **Description and purpose:** An asynchronous service that retrieves PII-redacted document images for a given session, encodes them as base64, and submits them to the Gemini API using prompt-engineered extraction instructions per document type. It parses the Gemini JSON response into a typed extraction result object, stores the raw response and structured field values in the database for reference and auditability, and returns the extraction result to the controller for display to the counselor. 

    * **Component type or format:** Asynchronous External API Client Service 

  * **StudentProfileBuilder** 

    * **Description and purpose:** A service that assembles the final student profile object in memory by combining the AI-extracted academic data retrieved from the database with the counselor notes submitted from the CounselorNotesEditor and a session timestamp. The assembled profile is not persisted as a permanent student record. After counselor approval, the assembled profile is saved as an encrypted session draft in the durable session store (see §5.1) to enable session resume within the configured expiry window. 

    Note: The database does hold session-scoped records that support this pipeline: Session and SessionNotes records (created by SessionInitializationService) and ExtractionResult records (created by GeminiExtractionService). These records are operational data, not a student profile store. They are subject to the data retention policy and must be purged on the schedule defined there. The database does not hold a persisted, assembled ApprovedProfile object.

    * **Component type or format:** In-Memory Domain Aggregation Service Class 

* Object-Oriented Components

  * Class Diagram

![][image16] 

* Sequence Diagram

![][image17]

* Data Design

  * ERD or schema

![][image18] 

### ***Module 3***

#### ***3.1 Federated Multi-Agent Analysis***

* User Interface Design

The user interface for this module is a dynamic loading and progress screen, providing visual feedback to the counselor while the backend agents run, featuring a bar showing overall progress. It lists step-by-step progress indicators for each of the AI agents: the Academic Auditor, Industry Analyst, and the Feasibility Strategist.

* Front-end component(s)

  * **AnalysisProgressOverlay**

    * **Description and purpose:** Renders the real-time loading state of the multi-agent analysis to provide continuous visual feedback to the counselor. 

    * **Component type or format:** Next.js/React client component.

* Back-end component(s)

  * **AgentDispatcher**

    * **Description and purpose:** Receives the counselor-approved student profile from Module 2 and simultaneously distributes the profile to the three independent reasoning agents. It manages asynchronous execution, collects the three independent outputs, and queues them for the synthesis phase. 

    * **Component type or format:** Next.js API Route / orchestration service class. 

  * **AcademicAuditorAgent** 

    * **Description and purpose:** A specialist agent responsible for analyzing the academic performance dimensions of the counselor-approved student profile and grounding that analysis in occupational employment context. It first queries the Market Analytics silo of the Supabase pgvector instance for PSA occupational employment records relevant to the student’s strongest academic domains, then combines the retrieved context with the profile’s structured academic fields (NCAE subscores, NAT composite score, and Form 137 grade records) to produce an academic analysis output containing aptitude signals, subject mastery patterns, observable strengths and weaknesses, and sector-level occupational demand signals relevant to career alignment.

    * **Component type or format:** AI Agent service class utilizing a Retrieval-Augmented Generation (RAG) architecture connected to the Market Analytics silo in Supabase and the Gemini API.

  * **IndustryAnalystAgent** 

    * **Description and purpose:** A specialist agent designated to query the Labor Demand silo of the vector database for market context. It uses this retrieved context to analyze market demand and to generate an independent analysis of market demand and occupational outlook for the student. 

    * **Component type or format:** AI Agent service class utilizing a Retrieval-Augmented Generation (RAG) architecture connected to Supabase and the Gemini API. 

  * **FeasibilityStrategistAgent** 

    * **Description and purpose:** A specialist agent designated to query the Path Feasibility knowledge silo of the Supabase pgvector instance for scholarship eligibility, TESDA program costs, and tuition benchmarks relevant to the student's profile. 

    * **Component type or format:** AI Agent service class utilizing a Retrieval-Augmented Generation (RAG) architecture connected to Supabase and the Gemini API. 

  * **QueryEmbeddingService**

    * **Description and purpose:** Produces a 768-dimensional embedding vector for an agent’s query string by calling the Gemini gemini-embedding-001\` model via the Google AI REST API, with outputDimensionality=768 and taskType=RETRIEVAL\_QUERY. This vector is passed to VectorStoreQueryService as the input for Supabase pgvector similarity search. The model name, output dimensionality, and request parameters must match the ingestion-time EmbeddingService used in Modules 1.1, 1.2, and 1.3 so query and stored chunk vectors occupy the same embedding space; the only intended difference is \`taskType\` (RETRIEVAL\_QUERY here vs. RETRIEVAL\_DOCUMENT at ingestion). If the embedding call fails, the agent query is aborted and the Agent Failure Recovery policy applies.

    * **Component type or format:** TypeScript service class calling the Gemini REST API via the @google/generative-ai Node.js SDK. Shared singleton across all three agents in a single session to avoid redundant API calls.

  * **VectorStoreQueryService**

    * **Description and purpose:** Handles similarity search operations against the Supabase pgvector instance. It enforces the Federated RAG architecture by strictly routing each agent’s queries to its designated silo only: the Academic Auditor’s queries to the Market Analytics silo, the Industry Analyst’s queries to the Labor Demand silo, and the Feasibility Strategist’s queries to the Path Feasibility silo. Any query that targets a silo not assigned to the requesting agent is rejected with a routing error before reaching Supabase, preventing cross-domain contamination.

    * **Component type or format:** Node.js data access service class (TypeScript). This component runs inside the session-time Next.js application on Vercel.

* Object-Oriented Components

  * Class Diagram


  


  


  


  


  


   

  * Sequence Diagram


* Data Design

  * ERD or schema

![][image19] 

#### ***3.2 Meta-Agent Convergence and Ranking***

* User Interface Design

Not applicable as a distinct screen. The MetaAgentSynthesizer executes entirely in the background as a continuation of the loading state already rendered by the AnalysisProgressOverlay in Module 3.1. The counselor remains on the same progress screen, which updates its overall progress bar to reflect the synthesis step as a fourth and final sub-process labeled "Synthesizing Career Recommendations." Upon completion, the system transitions automatically to the Module 4 results screen without any required counselor action. 

* Front-end component(s)

  * **AnalysisProgressOverlay**

    * **Description and purpose:** No new frontend component is introduced for this module. The existing AnalysisProgressOverlay from Module 3.1 is extended to render a fourth progress indicator representing the meta-agent synthesis step. It polls the backend status endpoint for a completion or failure signal and triggers the transition to the Module 4 report screen upon receiving it. 

    * **Component type or format:** Next.js/React client component; shared with Module 3.1. 

* Back-end component(s)

  * **MetaAgentSynthesizer**

    * **Description and purpose:** The central orchestration component of this module. It receives the list of AgentOutput objects from the AgentDispatcher, sequentially invokes the SynthesisInterpreter, AlignmentScoreCalculator, RankingAgent, and RankedRecommendationBuilder, and produces the RankedRecommendationList consumed by Module 4\. If the SynthesisInterpreter fails after one automatic retry, the pipeline is aborted and the counselor is notified; if the RankingAgent fails, the pipeline proceeds with placeholder reasoning summaries and the affected recommendations are flagged as degraded.

    * **Component type or format:** Next.js API Route implemented as an orchestration service class with sequential stage management.

  * **SynthesisInterpreter**

    * **Description and purpose:** Executes the first of the two Gemini inference calls in this module. It receives all three AgentOutput objects, submits a structured prompt to the Gemini API in JSON output mode, and instructs the model to identify candidate career paths supported by the combined signals across all three agent dimensions, populating a defined schema for each candidate with a career path name, normalized dimension scores between 0.0 and 1.0 for aptitude fit, market demand, and financial feasibility, the specific signals that substantiate each score, and the retrieved source references. The JSON schema is enforced at the API call level to guarantee that the response is directly parseable into an IntermediateSynthesis object without any text extraction or regex parsing. 

    * **Component type or format:** AI agent service class wrapping a single structured Gemini API call in JSON output mode. 

  * **AlignmentScoreCalculator**

    * **Description and purpose:** Receives the IntermediateSynthesis produced by the SynthesisInterpreter and computes a single numerical Aptitude-Demand Alignment Score for each candidate career path by applying a configurable weighted formula across the three normalized dimension scores: `alignmentScore = (aptitudeWeight × aptitudeScore) + (demandWeight × demandScore) + (feasibilityWeight × feasibilityScore)`. The default weights — aptitudeWeight at 0.35, demandWeight at 0.40, and feasibilityWeight at 0.25 — are defined as named environment-level configuration constants so they can be adjusted from MVP evaluation findings without a code change. It returns a list of ScoredCareerPath objects sorted in descending order by their computed alignment score. 

    * **Component type or format:** Node.js utility class implementing a stateless weighted scoring function with configurable weight parameters.

  * **RankingAgent**

    * **Description and purpose:** Executes the second of the two Gemini inference calls in this module. It receives the list of ScoredCareerPath objects from the AlignmentScoreCalculator and submits a structured prompt to the Gemini API in JSON output mode, instructing the model to generate a plain-language Chain-of-Thought reasoning summary for each path that explains the alignment score in terms a counselor can communicate to a student, explicitly citing the signals that drove the ranking and identifying any trade-offs or concerns. This call does not modify the alignment scores or the ranking order, which were determined deterministically by the AlignmentScoreCalculator in the previous step. 

    * **Component type or format:** AI agent service class wrapping a single structured Gemini API call in JSON output mode. 

  * **RankedRecommendationBuilder**

    * **Description and purpose:** Receives the scored and reasoned ScoredCareerPath list and constructs the final RankedRecommendationList object for Module 4\. It enforces the minimum of three distinct recommendations required by the SRS, flags any recommendation whose contributing AgentOutput carries a FAILED status as incomplete, and flags any recommendation whose reasoning summary is a placeholder as degraded. It writes the completed records to the RankedRecommendations and RecommendationSources tables before returning the RankedRecommendationList to the MetaAgentOrchestrator. 

    * **Component type or format:** Node.js utility class performing deterministic assembly and database write with no external API calls. 

* Object-Oriented Components

  * Class Diagram

  ![][image20] 

  * Sequence Diagram

  ![][image21]


* Data Design

  * ERD or schema

  ![][image22] 

  ### ***Module 4***

#### ***4.1 Explainable Report Generation***

* User Interface Design

Not applicable for this sub-module's internal processing. The report generation step is a fully automated server-side compilation triggered immediately after the meta-agent produces its ranked output. There is no counselor-facing interface during generation itself; the counselor sees only the loading/progress state inherited from Module 3\. The rendered output surfaces in Module 4.2. 

* Front-end component(s)

Not applicable. The frontend receives a completion signal from the backend upon successful PDF rendering and transitions to the download screen defined in Module 4.2. No interactive UI element belongs to the generation step itself. 

* Back-end component(s)

  * **ReportDataAssembler** 

    * **Description and purpose:** Collects the ranked career paths, CoT reasoning traces, alignment scores, retrieved source references with ingestion timestamps, and the approved student profile into a single payload object passed to all downstream rendering components. 

    * **Component type or format:** TypeScript utility function within a Next.js API route. 

  * **ReasoningSummaryFormatter** 

    * **Description and purpose:** Converts the raw CoT traces into plain-language summaries explaining why each career path was recommended and what evidence supported it. 

    * **Component type or format:** TypeScript utility function. 

  * **AuditTrailBuilder** 

    * Description and purpose: For each recommendation, traces supporting data back to their source,  recording the source URL or reference, acquisition method, and ingestion timestamp to produce a verifiable evidence chain. 

    * Component type or format: TypeScript utility function; reads provenance metadata attached to retrieved chunks by the VectorStoreRepository.  

  * **PDFLayoutRenderer** 

    * **Description and purpose:** Takes the assembled report payload and renders it into a PDF using a server-side library (e.g., pdfkit), applying the Kumpas report template with career panels, alignment scores, reasoning summaries, and audit trail. Returns the rendered PDF as an in-memory Buffer. Does not write to the filesystem.

    * **Component type or format:** TypeScript service class wrapping a server-side PDF library. Executes entirely server-side within a single Next.js API route invocation.

  * **PDFFileStore** 

    * **Description and purpose:** Receives the in-memory PDF Buffer from PDFLayoutRenderer, uploads it to a private Supabase Storage bucket (bucket: kumpas-reports) using the service\_role key, and generates a signed URL with a TTL of 30 minutes. The object is stored under the key {sessionId}/{sessionId}.pdf. Returns the signed URL to the API route, which forwards it to the frontend as the download endpoint for Module 4.2. No file path is registered; no retrieval token is issued. The signed URL is the only artefact returned.

    * **Component type or format:** TypeScript utility class using the Supabase Storage JavaScript client (@supabase/storage-js). The /tmp filesystem is not used.

* Object-Oriented Components

  * Class Diagram

![][image23]

* Sequence Diagram

![][image24]

* Data Design

  * ERD or schema 

![][image25]

#### ***4.2 Report Presentation and Download***

* User Interface Design

The frontend transitions from the Module 3 progress screen to a completion screen showing an on-screen summary of the top career recommendations and a PDF download button. A "Start New Session" control is also present here. 

* Front-end component(s)

  * **ReportCompletionView** 

    * **Description and purpose:** Displays the session output: top career paths, alignment scores, and key signal badges, as an on-screen summary, alongside the download button and session-end controls. 

    * **Component type or format:** Next.js React page component; reads session state from the API response. 

  * **PDFDownloadButton** 

    * **Description and purpose:** Uses the signed URL returned by the Module 4.1 API route to trigger a native browser file download via a dynamically created \<a\> element with the download attribute. The signed URL is passed through session state from the Module 4.1 completion response; no additional API call is made at download time.

    * **Component type or format:** React client component using a dynamically created anchor element. 

* Back-end component(s)

  * Not applicable. The PDF download in this module requires no server involvement. 

* Object-Oriented Components

  * Class Diagram

![][image26]

* Sequence Diagram

![][image27]

* Data Design

  * ERD or schema

![][image28]

### ***Module 5***

#### ***5.1 End-to-End Session Orchestration*** 

* User Interface Design

The application shell renders a persistent step indicator showing the counselor's position in the session pipeline (Upload → Confirm → Analysis → Report). The landing screen presents a "Get Started" call-to-action to begin a new session. 

* Front-end component(s)

  * **SessionShell** 

    * **Description and purpose:** Root layout component that holds client-side session state and manages view transitions across all module screens without full page reloads. 

    * **Component type or format:** Next.js React layout component using React context or Zustand for state propagation. 

  * **SessionProgressIndicator** 

    * **Description and purpose:** Read-only step tracker showing the counselor's current position across the four session stages. Reflects the authoritative state from SessionShell. 

    * **Component type or format:** React client component. 

* Back-end component(s)

  * **SessionStateManager** 

    * **Description and purpose:** Initializes, reads, updates, and expires durable session draft records. It stores module completion status, counselor-approved profile data, completed agent outputs, and report-generation status in the configured durable session store. It supports session resumption after browser timeout or serverless instance recycling.

    * **Component type or format:**TypeScript service class using Supabase sessions table or Vercel KV/Upstash Redis. It does not rely on in-memory process state.

  * **ModuleRouteOrchestrator**  

    * **Description and purpose:** Validates that all preconditions for a module step are met before allowing progression, for example, confirming counselor approval before dispatching agent analysis. 

    * **Component type or format:** TypeScript middleware applied to Next.js API route handlers. 

* Object-Oriented Components

  * Class Diagram

![][image29]

* Sequence Diagram

![][image30]

* Data Design

  * ERD or schema 

![][image31]

#### ***5.2*** **Local Data and Privacy Management**

* User Interface Design

A confirmation modal is shown when the counselor ends a session or starts a new one, warning that the action is irreversible. All PII purge operations run silently in the background after confirmation. 

* Front-end component(s)

  * **SessionEndConfirmationModal** 

    * **Description and purpose:** Modal that warns the counselor that ending the session will permanently clear all temporary document data. Offers "Cancel" and "Yes, new session" actions. 

    * **Component type or format:** React client component rendered as an overlay within SessionShell. 

* Back-end component(s)

  * **SessionTerminationHandler** 

    * **Description and purpose:** API route handler that runs the purge and archive steps in sequence upon session end, then clears the session state and signals the frontend to reset. 

    * **Component type or format:** Next.js API route handler. 

  * **PDFStoragePurger**

    * **Description and purpose:** Deletes the session’s PDF object from Supabase Storage (key: {sessionId}/{sessionId}.pdf) using the service\_role key. Called by SessionTerminationHandler immediately after RawImagePurger. If the object does not exist (e.g. the session ended before a PDF was generated, or it was already deleted), the call is a no-op. Deletion failure is logged at WARN level but does not block session reset — the signed URL TTL (30 min) acts as a backstop.

    * **Component type or format:** TypeScript utility using the Supabase Storage client. Operates against the kumpas-reports 

  * **RawImagePurger** 

    * **Description and purpose:** Permanently deletes a raw (unredacted) document image from /tmp immediately after PIIRedactionService completes redaction for that document, whether redaction succeeded or failed. This component is also called by SessionTerminationHandler as a sweep at session end, acting as a safety net to remove any residual raw files that may remain due to unexpected failures. The safety-net call does not replace or defer the primary post-redaction invocation.

    * **Component type or format:** TypeScript utility function using Node.js fs; operates on /tmp. 

  * **CorrectionLogArchiver** 

    * **Description and purpose:** Writes the counselor’s field correction log — field names, AI-extracted values, and counselor-corrected values — to the correction\_logs Supabase table for post-MVP accuracy evaluation. One row is inserted per corrected field per session. Fields that were not corrected are not recorded. No student-identifiable data is written: the log contains the session\_id, field\_name (e.g. 'ncae\_science\_subscore'), extracted\_value (numeric or text), corrected\_value (numeric or text), and correction\_timestamp. No student name, birthdate, or any of the five qualitative session-notes fields is included.

    * **Component type or format:** TypeScript utility function using the Supabase JavaScript client with the service\_role key. The local filesystem is not used.

  * **SessionTimeoutWatcher** 

    * **Description and purpose:** Scans the sessions table to detect inactive sessions exceeding the 24-hour timeout threshold (last\_activity \> 24h). It automatically invokes a stored procedure to purge expired session drafts and execute  SessionTerminationHandler-equivalent cleanup, preventing abandoned sessions from leaving PII in storage. 

    * **Component type or format:** A Postgres function scheduled via pg\_cron (e.g., running every 5–10 minutes). It executes entirely within Supabase with no Vercel or external server involvement. 

* Object-Oriented Components

  * Class Diagram

![][image32]

* Sequence Diagram

![][image33]

* Data Design

  * ERD or schema

![][image34]

[image1]: docs/images/sdd/image1.png

[image2]: docs/images/sdd/image2.png

[image3]: docs/images/sdd/image3.png

[image4]: docs/images/sdd/image4.png

[image5]: docs/images/sdd/image5.png

[image6]: docs/images/sdd/image6.png

[image7]: docs/images/sdd/image7.png

[image8]: docs/images/sdd/image8.png

[image9]: docs/images/sdd/image9.png

[image10]: docs/images/sdd/image10.png

[image11]: docs/images/sdd/image11.png

[image12]: docs/images/sdd/image12.png

[image13]: docs/images/sdd/image13.png

[image14]: docs/images/sdd/image14.png

[image15]: docs/images/sdd/image15.png

[image16]: docs/images/sdd/image16.png

[image17]: docs/images/sdd/image17.png

[image18]: docs/images/sdd/image18.png

[image19]: docs/images/sdd/image19.png

[image20]: docs/images/sdd/image20.png

[image21]: docs/images/sdd/image21.png

[image22]: docs/images/sdd/image22.png

[image23]: docs/images/sdd/image23.png

[image24]: docs/images/sdd/image24.png

[image25]: docs/images/sdd/image25.png

[image26]: docs/images/sdd/image26.png

[image27]: docs/images/sdd/image27.png

[image28]: docs/images/sdd/image28.png

[image29]: docs/images/sdd/image29.png

[image30]: docs/images/sdd/image30.png

[image31]: docs/images/sdd/image31.png

[image32]: docs/images/sdd/image32.png

[image33]: docs/images/sdd/image33.png

[image34]: docs/images/sdd/image34.png