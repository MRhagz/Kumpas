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

* **Knowledge Base Population:** Automated periodic acquisition of Philippine labor market data from PSA OpenSTAT and DOLE BLE LMI publications, scholarship and priority program data from CHED Memorandum Orders, and manually curated TESDA program cost records, stored in a structured, timestamped vector store that serves as the sole factual foundation for all agent-generated recommendations. 

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

3. # **Detailed Design** {#detailed-design}

### ***Module 1*** {#module-1}

#### ***1.1 PSA OpenSTAT CSV Ingestion***

* User Interface Design

Not applicable. This module is a fully automated backend pipeline triggered by a quarterly scheduler. There is no counselor-facing or administrator-facing interface involved in its execution; it operates entirely in the background without any human interaction during a run. Any status it produces is surfaced elsewhere in the counselor interface as a read-only ingestion timestamp. 

* Front-end component(s)

Not applicable. The ingestion timestamp updated by this pipeline is consumed by the counselor interface in a separate display component that belongs to Module 5 (Session Orchestration), not to this module itself. 

* Back-end component(s)

  * **QuarterlyScheduler**	

    * **Description and purpose:** Triggers the PSA OpenSTAT ingestion pipeline on a quarterly cadence aligned with the PSA Labor Force Survey release cycle. It acts as the entry point of the entire flow, firing the pipeline job without any manual intervention.

    * **Component type/format:** Cron job / background task runner (e.g., a Python APScheduler job or a Vercel Cron configuration pointing to a serverless function endpoint).

  * **PSAOpenSTATClient** 

    * **Description and purpose:** Responsible for issuing an authenticated or unauthenticated HTTP GET request to the PSA OpenSTAT CSV endpoint. It checks the HTTP response status and either returns the raw CSV bytes or raises a download failure event to the logger.

    * **Component type/format:** Python service class using the requests or httpx library.

  * **LFSCSVParser** 

    * **Description and purpose:** Receives the raw CSV bytes from the client and loads them into a structured DataFrame using pandas. Handles encoding issues, malformed rows, and column normalization.

    * **Component type/format:** Python utility class wrapping pandas.read\_csv.

  * **OccupationRecordExtractor** 

    * **Description and purpose:** Reads the parsed DataFrame and extracts occupation-sector employment records into a normalized list of domain objects. Applies column mapping and filters out incomplete or irrelevant rows.

    * **Component type/format:** Python utility class; pure data transformation logic with no I/O side effects.

  * **TextChunker**

    * **Description and purpose:** Converts each OccupationRecord into one or more text chunks suitable for embedding. Each chunk carries provenance metadata (source URL, acquisition method, ingestion timestamp) so that the vector store record is fully attributable.

    * **Component type/format:** Python utility class with configurable chunk\_size and overlap parameters.

  * **EmbeddingService** 

    * **Description and purpose:** Transforms each text chunk into a dense vector representation using a sentence-level embedding model. This is the component responsible for the semantic encoding that enables similarity search in the vector store.

    * **Component type/format:** Python service class wrapping a sentence-transformers model (e.g., all-MiniLM-L6-v2). The model is loaded once at startup and reused for all chunks in a single run.

  * **VectorStoreRepository**

    * **Description and purpose:** Handles all write operations to the Supabase pgvector\-enabled PostgreSQL instance. It performs upsert operations (insert or update by a content hash or source-URL \+ chunk-index key) to avoid duplicating records across quarterly runs. After a successful upsert batch, it updates the ingestion timestamp record for the occupational silo.

    * **Component type/format:** Python data access class using the supabase-py client and psycopg2 for direct PostgreSQL operations where needed.

  * **IngestionLogger** 

    * **Description and purpose:** Records the outcome of every pipeline run — success with record count, or failure with error detail and stack trace. On failure, it dispatches an alert to the technical administrator (e.g., via email or a monitoring webhook). On success, it writes a structured log entry for audit purposes.

    * **Component type/format:** Python service class; uses Python's built-in logging module with a configurable handler (file, email SMTP, or webhook).

    

* Object-Oriented Components

  * Class Diagram

  ![][image1] 

  * Sequence Diagram

![][image2]

* Data Design

  * ERD or schema

![][image3]

#### ***1.2 DOLE BLE / CHED PDF Parsing & Ingestion***

* User Interface Design

Not applicable. This module is a fully automated, scheduler-driven backend pipeline that operates entirely outside of active counseling sessions. It requires no counselor or end-user interaction. Like Module 1.1, its only output visible to the counselor is the updated ingestion timestamp displayed in the counselor interface, which is rendered by a separate read-only display component in Module 5\. 

* Front-end component(s)

Not applicable for the same reason stated above. This pipeline has no interactive surface; it is a background service whose execution state is logged internally and whose outputs are stored in the vector store. 

* Back-end component(s)

  * **WeeklyScheduler**

    * **Description and purpose:** Triggers the DOLE BLE / CHED ingestion pipeline on a weekly cadence. It is the sole entry point to the pipeline and fires without any manual intervention.

    * **Component type/format:** Cron job / Python APScheduler job or Vercel Cron endpoint.

  * **PublicationIndexChecker** 

    * **Description and purpose:** Queries the DOLE BLE and CHED publication index pages to detect newly released PDFs since the last ingestion timestamp. It compares the detected entries against a local cache of previously processed publication URLs to determine which ones are new. If none are new, it signals a no-op and the pipeline terminates without modifying the vector store.

    * **Component type/format:** Python service class; uses httpx for HTTP requests and BeautifulSoup or a structured API client if the index is machine-readable. Reads the last ingestion timestamp from ingestion\_metadata.

  * **PDFDownloader** 

    * **Description and purpose:** Downloads a PDF document over HTTPS from a given publication URL. On failure, it raises a typed exception that the pipeline catches and routes to the logger. Does not perform any extraction or transformation.

    * **Component type/format:** Python utility class using httpx with streaming support for large PDF files.

  * **PDFTextExtractor** 

    * **Description and purpose:** Accepts raw PDF bytes and extracts all page text using pdfplumber. Handles multi-column layouts and hyphenation artifacts where possible.

    * **Component type/format:** Python utility class wrapping pdfplumber.open().

  * **TextCleaner** 

    * **Description and purpose:** Post-processes the raw extracted text by detecting and removing headers, footers, and page-number artifacts using pattern matching and heuristic line-length filters. Produces clean, paragraph-level text ready for chunking.

    * **Component type/format:** Python utility class with regex-based cleaning rules configurable per source type (DOLE vs CHED).

  * **TextChunker** 

    * **Description and purpose:** Splits cleaned text into overlapping chunks of a fixed token length, preserving sentence boundaries where possible. Each chunk is paired with provenance metadata derived from the source publication.

    * **Component type/format:** Python utility class; shared with Module 1.1 through a common chunking utility module.

  * **EmbeddingService** 

    * **Description and purpose:** Converts each text chunk into a dense vector using the same sentence-level embedding model used in Module 1.1, ensuring embedding-space consistency across all knowledge silos.

    * **Component type/format:** Python service class; shared singleton instance across all pipeline modules.

  * **VectorStoreRepository** 

    * **Description and purpose:** Upserts embedded chunks into the appropriate Supabase knowledge silo — Live Labor Demand for DOLE BLE LMI records, and Path Feasibility for CHED Memorandum Order records — based on a source\_type tag attached to each chunk's metadata. Updates the ingestion timestamp for the affected silo after a successful batch.

    * **Component type/format:** Python data access class using supabase-py; silo routing is determined by the source\_type field in chunk metadata.

  * **PublicationIndexCache** 

    * **Description and purpose:** Maintains a record of all publication URLs that have been successfully ingested, enabling the PublicationIndexChecker to perform change detection without re-downloading already-processed documents. Stored in a Supabase table.

    * **Component type/format:** PostgreSQL table accessed via VectorStoreRepository; effectively acts as an idempotency guard.

  * **IngestionLogger** 

    * **Description and purpose:** Records run outcomes per publication, logs no-op runs, and dispatches administrator alerts on download or parsing failures.

    * **Component type/format:** Python service class; shared with Module 1.1.

* Object-Oriented Components

  * Class Diagram

![][image4]   

* Sequence Diagram

![][image5]

* Data Design

  * ERD or schema

![][image6] 

#### ***1.3 Manual TESDA Cost Curation & Ingestion***

* User Interface Design

Not applicable within the main Kumpas counselor application. The curation interface for the technical administrator is a separate administrative tool — such as a structured spreadsheet template or a standalone data entry form — that exists outside the scope of the counselor-facing application and is not deployed as part of the Kumpas web interface. 

* Front-end component(s)

Not applicable. The administrator interacts with the system by submitting a validated CSV or JSON file conforming to the TESDA record schema, or by directly invoking the curation ingestion script. No browser-rendered form is part of this module's design in the main application. 

* Back-end component(s)

  * **SemesterCurationTrigger** 

    * **Description and purpose:** Entry point for the manual curation process. The technical administrator invokes this component — either via a CLI command or a secure admin API endpoint — to begin the ingestion of a prepared batch of TESDA program cost records. It reads the batch file path or payload and passes it downstream.

    * **Component type/format:** Python CLI script (click\-based) or a secured Next.js API route restricted to administrator credentials.

  * **TESDARecordValidator** 

    * **Description and purpose:** Validates each submitted TESDA record against a defined schema: required fields must be present (program name, cost, tuition benchmark, TESDA qualification code, source reference), numeric fields must be in acceptable ranges, and the source reference must be a non-empty string. Invalid records are flagged with field-level error messages and returned to the administrator for correction before any embedding or upsert occurs. No partial batches are written to the vector store.

    * **Component type/format:** Python utility class using  pydantic for schema definition and validation.

  * **TESDARecordSchema (Pydantic Model)** 

    * **Description and purpose:** Defines the canonical structure and validation rules for a single TESDA program cost record. Acts as the contract between the administrator's curation template and the ingestion pipeline.

    * **Component type/format:** Python pydantic.BaseModel data class.

  * **EmbeddingService** 

    * **Description and purpose:** Embeds each TESDA text chunk using the shared sentence-level embedding model to ensure vector-space consistency across all three silos.

    * **Component type/format:** Python service class; shared singleton with Modules 1.1 and 1.2.

  * **VectorStoreRepository** 

    * **Description and purpose:** Upserts embedded TESDA records into the Path Feasibility knowledge silo in Supabase. Performs conflict resolution on a composite key of tesda\_qualification\_code \+ program\_name to prevent duplicate entries across semester refresh cycles. Updates the ingestion timestamp for the Path Feasibility silo after a successful batch.

    * **Component type/format:** Python data access class; shared with Modules 1.1 and 1.2.

  * **ValidationReporter** 

    * **Description and purpose:** Produces a structured validation report after the validator runs, listing all records that failed validation along with the specific fields that caused failure. This report is printed to the administrator's terminal or written to a report file so corrections can be made before re-submitting.

    * **Component type/format:** Python utility class; formats output as a human-readable table using tabulate or as a JSON file.

  * **IngestionLogger** 

    * **Description and purpose:** Records the result of the curation ingestion run, including the number of records validated, the number successfully upserted, and any validation or write errors. Also marks the run with the acquisition method flag manual\_curation for audit trail purposes.

    * **Component type/format:** Python service class; shared with Modules 1.1 and 1.2.

* Object-Oriented Components

  * Class Diagram

![][image7]  

* Sequence Diagram

![][image8]

* Data Design

  * ERD or schema

  ![][image9]

.

### ***Module 2*** {#module-2}

#### ***2.1 Document Intake and Automatic Redaction***

* User Interface Design

![][image10]

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

    * **Description and purpose:** An HTTP request handler that receives multipart file uploads, validates content type and file size, assigns a unique document ID, writes the raw image to temporary storage, and enqueues a redaction job. The HTTP response returns immediately with a 202 Accepted while redaction runs asynchronously. 

    * **Component type or format:** REST API Controller (FastAPI Route Handler) 

  * **PIIRedactionService**

    * **Description and purpose:** An asynchronous worker that consumes redaction jobs from the message queue and applies PII removal to raw document images. It uses named-entity recognition and regex pattern matching to detect student names, birthdates, and ID numbers, then overwrites detected regions with opaque black rectangles. On completion, it updates the document record and pushes a status event to the frontend. 

    * **Component type or format:**  Asynchronous Background Worker Service 

  * **DocumentStorageService** 

    * **Description and purpose:** A utility service that abstracts all file I/O for both raw and redacted document images. It exposes three operations: store raw, store redacted, and retrieve redacted. Raw images are never exposed through any public-facing API route, ensuring unredacted originals cannot reach the extraction pipeline. 

    * **Component type or format:**  Singleton Service Class (Dependency-Injected) 

  * SessionInitializationService 

    * **Description and purpose:** A service responsible for creating and persisting a new counseling session record when a counselor begins a session. It generates the session ID, records the counselor's identity, sets the initial session status, and coordinates the creation of the linked session notes record once the form is submitted. 

    * **Component type or format:**  Service Layer Class (Repository Pattern)

* Object-Oriented Components

  * Class Diagram

![][image11] 

* Sequence Diagram

![][image12]

* Data Design

  * ERD or schema


#### ***2.2 Al Extraction and Counselor Confirmation***

* User Interface Design

![][image13]

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

    * **Description and purpose:** A service that assembles the final student profile object in memory by combining the AI-extracted academic data retrieved from the database with the counselor notes submitted from the CounselorNotesEditor and a session timestamp. The assembled profile is not persisted as a new database record. Instead, it is serialized and published directly to the message queue as a PROFILE\_READY event consumed by the agent orchestration layer. The database in this system serves exclusively as the RAG knowledge store for the analysis agents, not as a general profile persistence layer. 

    * **Component type or format:** In-Memory Domain Aggregation Service Class 

* Object-Oriented Components

  * Class Diagram

![][image14] 

* Sequence Diagram

![][image15]

* Data Design

  * ERD or schema

![][image16] 

### ***Module 3***

#### ***3.1 Federated Multi-Agent Analysis***

* User Interface Design

The user interface for this module is a dynamic loading and progress screen, providing visual feedback to the counselor while the backend agents run, featuring a bar showing overall progress. It lists step-by-step progress indicators for each of the AI agents: the Feasibility Analyst, Labor Market Analyst, and Job Demands Analyst. 

* Front-end component(s)

  * **AnalysisProgressOverlay**

    * **Description and purpose:** Renders the real-time loading state of the multi-agent analysis to provide continuous visual feedback to the counselor. 

    * **Component type or format:** Next.js/React client component.

* Back-end component(s)

  * **AgentDispatcher**

    * **Description and purpose:** Receives the counselor-approved student profile from Module 2 and simultaneously distributes the profile to the three independent reasoning agents. It manages asynchronous execution, collects the three independent outputs, and queues them for the synthesis phase. 

    * **Component type or format:** Next.js API Route / orchestration service class. 

  * **AcademicAuditorAgent** 

    * **Description and purpose:** A specialist agent responsible for analyzing the academic performance dimensions of the counselor-approved student profile. It operates exclusively on the structured data fields already present in the profile (NCAE subscores, NAT composite score, and Form 137 grade records) and returns an academic analysis output containing aptitude signals, subject mastery patterns, and observable strengths and weaknesses relevant to career alignment. 

    * **Component type or format:** AI Agent service class wrapping a structured Gemini API call.

  * **IndustryAnalystAgent** 

    * **Description and purpose:** A specialist agent designated to query the Labor Demand silo of the vector database for market context. It uses this retrieved context to analyze market demand and to generate an independent analysis of market demand and occupational outlook for the student. 

    * **Component type or format:** AI Agent service class utilizing a Retrieval-Augmented Generation (RAG) architecture connected to Supabase and the Gemini API. 

  * **FeasibilityStrategistAgent** 

    * **Description and purpose:** A specialist agent designated to query the Path Feasibility knowledge silo of the Supabase pgvector instance for scholarship eligibility, TESDA program costs, and tuition benchmarks relevant to the student's profile. 

    * **Component type or format:** AI Agent service class utilizing a Retrieval-Augmented Generation (RAG) architecture connected to Supabase and the Gemini API. 

  * **VectorStoreQueryService**

    * **Description and purpose:** Handles similarity search operations against the Supabase pgvector instance. It enforces the Federated RAG architecture by strictly routing the Industry Analyst's queries only to the Labor Demand silo and the Feasibility Strategist's queries only to the Path Feasibility silo, preventing cross-domain contamination. 

    * **Component type or format:** Python/Node.js data access service class. 

* Object-Oriented Components

  * Class Diagram


  


  


  


  


  


   

  * Sequence Diagram


* Data Design

  * ERD or schema

  ![][image17] 

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

    * **Description and purpose:** Receives the IntermediateSynthesis produced by the SynthesisInterpreter and computes a single numerical Aptitude-Demand Alignment Score for each candidate career path by applying a configurable weighted formula across the three normalized dimension scores: alignmentScore \= (aptitudeWeight × aptitudeScore) \+ (demandWeight × demandScore) \+ (feasibilityWeight × feasibilityScore). The default weights — aptitudeWeight at 0.35, demandWeight at 0.40, and feasibilityWeight at 0.25 — are defined as named environment-level configuration constants so they can be adjusted from MVP evaluation findings without a code change. It returns a list of ScoredCareerPath objects sorted in descending order by their computed alignment score. 

    * **Component type or format:** Node.js utility class implementing a stateless weighted scoring function with configurable weight parameters.

  * **RankingAgent**

    * **Description and purpose:** Executes the second of the two Gemini inference calls in this module. It receives the list of ScoredCareerPath objects from the AlignmentScoreCalculator and submits a structured prompt to the Gemini API in JSON output mode, instructing the model to generate a plain-language Chain-of-Thought reasoning summary for each path that explains the alignment score in terms a counselor can communicate to a student, explicitly citing the signals that drove the ranking and identifying any trade-offs or concerns. This call does not modify the alignment scores or the ranking order, which were determined deterministically by the AlignmentScoreCalculator in the previous step. 

    * **Component type or format:** AI agent service class wrapping a single structured Gemini API call in JSON output mode. 

  * **RankedRecommendationBuilder**

    * **Description and purpose:** Receives the scored and reasoned ScoredCareerPath list and constructs the final RankedRecommendationList object for Module 4\. It enforces the minimum of three distinct recommendations required by the SRS, flags any recommendation whose contributing AgentOutput carries a FAILED status as incomplete, and flags any recommendation whose reasoning summary is a placeholder as degraded. It writes the completed records to the RankedRecommendations and RecommendationSources tables before returning the RankedRecommendationList to the MetaAgentOrchestrator. 

    * **Component type or format:** Node.js utility class performing deterministic assembly and database write with no external API calls. 

* Object-Oriented Components

  * Class Diagram

  ![][image18] 

  * Sequence Diagram

  ![][image19]


* Data Design

  * ERD or schema

  ![][image20] 

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

    * **Description and purpose:** Takes the assembled report payload and renders it into a PDF file using a server-side library, applying the Kumpas report template with career panels, alignment scores, reasoning summaries, and audit trail. Writes the output to ephemeral storage.  

    * **Component type or format:** TypeScript service class wrapping a server-side PDF library (e.g., pdfkit). Executes entirely server-side. 

  * **PDFFileStore** 

    * **Description and purpose:** Registers the rendered PDF's file path and generates a short-lived, session-scoped retrieval token returned to the frontend for use in Module 4.2. 

    * **Component type or format:** TypeScript utility class; operates on the serverless function's ephemeral /tmp directory. 

* Object-Oriented Components

  * Class Diagram

![][image21]

* Sequence Diagram

![][image22]

* Data Design

  * ERD or schema 

![][image23]

#### ***4.2 Report Presentation and Download***

* User Interface Design

The frontend transitions from the Module 3 progress screen to a completion screen showing an on-screen summary of the top career recommendations and a PDF download button. A "Start New Session" control is also present here. 

* Front-end component(s)

  * **ReportCompletionView** 

    * **Description and purpose:** Displays the session output: top career paths, alignment scores, and key signal badges, as an on-screen summary, alongside the download button and session-end controls. 

    * **Component type or format:** Next.js React page component; reads session state from the API response. 

  * **PDFDownloadButton** 

    * **Description and purpose:** Sends a GET request to the PDF serving route using the retrieval token, triggering a native browser file download. Shows loading and error states accordingly. 

    * **Component type or format:** React client component using a dynamically created anchor element. 

* Back-end component(s)

  * **PDFServingRoute** 

    * **Description and purpose:** Validates the session-scoped retrieval token, retrieves the PDF from ephemeral storage, and streams it to the client with the appropriate Content-Disposition: attachment headers. 

    * **Component type or format:** Next.js API route handler; uses Node.js stream piping. 

* Object-Oriented Components

  * Class Diagram

![][image24]

* Sequence Diagram

![][image25]

* Data Design

  * ERD or schema

![][image26]

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

    * **Description and purpose:** Initializes and tracks the server-side session object, including the session identifier, module completion status, and the approved student profile. No student data is persisted to any database. 

    * **Component type or format:** TypeScript utility using in-memory state keyed by session identifier within a Vercel serverless function. 

  * **ModuleRouteOrchestrator**  

    * **Description and purpose:** Validates that all preconditions for a module step are met before allowing progression, for example, confirming counselor approval before dispatching agent analysis. 

    * **Component type or format:** TypeScript middleware applied to Next.js API route handlers. 

* Object-Oriented Components

  * Class Diagram

![][image27]

* Sequence Diagram

![][image28]

* Data Design

  * ERD or schema 

![][image29]

#### ***5.2** Report Presentation and Download*

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

  * **RawImagePurger** 

    * **Description and purpose:** Permanently deletes all unredacted raw document images from the session's ephemeral storage directory, ensuring no PII remains after session termination. 

    * **Component type or format:** TypeScript utility function using Node.js fs; operates on /tmp. 

  * **CorrectionLogArchiver** 

    * **Description and purpose:** Writes the counselor's field correction log: field names, extracted values, and corrected values, with no student-identifiable data, to a local log file for post-MVP accuracy evaluation. 

    * **Component type or format:** TypeScript utility function writing JSON entries to a configurable local path outside /tmp. 

  * **SessionTimeoutWatcher** 

    * **Description and purpose:** Detects inactive sessions exceeding a configured timeout threshold and automatically triggers the SessionTerminationHandler to purge ephemeral data, preventing abandoned sessions from leaving PII in storage. 

    * **Component type or format:** TypeScript server-side utility checking last-activity timestamps in the SessionStateManager. 

* Object-Oriented Components

  * Class Diagram

![][image30]

* Sequence Diagram

![][image31]

* Data Design

  * ERD or schema

![][image32]

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