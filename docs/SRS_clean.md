#     

## **CEBU INSTITUTE OF TECHNOLOGY**

**UNIVERSITY**

COLLEGE OF COMPUTER STUDIES

# 

# 

## 

## 

## 

# **Software Requirements Specifications**

## *for*

## *Kumpas*

# **Change History** {#change-history}

| Version | Date | Description | Author(s) |
| ----- | ----- | ----- | ----- |
| 1.0 | April 18, 2026 | Initial release of SRS document | Ewican, Milleza, Muli, Pepino, Rago |

# **Table of Contents** {#table-of-contents}

[**Change History	2**](#change-history)

[**Table of Contents	3**](#table-of-contents)

[**1\. Introduction	4**](#introduction)

[1.1.  Purpose	4](#purpose)

[1.2.  Scope	4](#scope)

[1.3.  Definitions, Acronyms and Abbreviations	5](#definitions,-acronyms-and-abbreviations)

[1.4.  References	6](#references)

[**2\.  Overall Description	8**](#overall-description)

[2.1.  Product perspective	8](#product-perspective)

[2.2.  User characteristics	8](#user-characteristics)

[2.4.  Constraints	8](#2.4.-constraints)

[2.5.  Assumptions and dependencies	9](#2.5.-assumptions-and-dependencies)

[**3\.  Specific Requirements	10**](#specific-requirements)

[3.1.  External interface requirements	10](#external-interface-requirements)

[3.1.1. Hardware interfaces	10](#3.1.1.-hardware-interfaces)

[3.1.2. Software interfaces	10](#3.1.2.-software-interfaces)

[3.1.3. Communications interfaces	10](#3.1.3.-communications-interfaces)

[3.2.  Functional requirements	10](#functional-requirements)

[Module 1	10](#module-1)

[Module 2	12](#module-2)

[Module 3	13](#module-3)

[Module 4	13](#module-4)

[Module 5	13](#module-5)

[3.3.  Non-Functional requirements	14](#non-functional-requirements)

[Performance	14](#performance)

[Security	14](#security)

[Reliability	14](#reliability)

 

1. # **Introduction** {#introduction}

   1. ## ***Purpose***  {#purpose}

This document is the Software Requirements Specification (SRS) for Kumpas, an explainable multi-agent career alignment system designed to support guidance counselors in Philippine high schools. The system addresses the chronic underutilization of student academic assessment data, specifically National Career Assessment Examination (NCAE) results, National Achievement Test (NAT) scores, and Form 137 grade records, by automating their extraction, synthesis, and application in career pathway recommendations.

This SRS is intended for the development team, the software engineering advisor, cooperating guidance counselors who will serve as primary users, and school administrators who will authorize deployment. It defines the complete functional and non-functional requirements that will govern system development and serve as the basis for the system design document (SDD) and acceptance testing.

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

3. ## ***Definitions, Acronyms and Abbreviations*** {#definitions,-acronyms-and-abbreviations}

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

2. # **Overall Description** {#overall-description}

   1. ## ***Product perspective*** {#product-perspective}

Kumpas is a standalone, counselor-facing web application designed to support career guidance sessions. It does not replace existing DepEd systems but addresses a gap where student assessment data (e.g., NCAE and NAT results) exist only as paper or PDF records with no automated integration into counseling workflows. As a result, counselors currently perform manual review and synthesis of these documents.

The system uses an external multimodal large language model (LLM) accessed via a secure API, configured via prompt engineering, supported by a retrieval-augmented generation (RAG) approach using a Supabase-hosted vector store (pgvector) pre-populated through three documented acquisition tiers: automated structured-file downloads from PSA OpenSTAT for occupational employment data, automated PDF parsing of publicly downloadable DOLE BLE LMI reports and CHED Memorandum Orders for in-demand occupation rankings and scholarship details, and manual curation of TESDA program cost and tuition benchmarks. Each indexed record retains its source reference, acquisition method (automated or manual), and ingestion timestamp. 

Kumpas operates through four sequential modules within a single session:   
(1) document upload and PII redaction  
(2) academic data extraction and confirmation  
(3) multi-agent career analysis  
(4) explainable report generation  
(5) session and deployment management.

It may optionally access a school Student Information System (SIS) in read-only mode for structured academic records.

2. ## ***User characteristics*** {#user-characteristics}

* **Primary User**: Licensed Guidance Counselor (Operator & Administrator)

  The Guidance Counselor is the sole direct user and local administrator of the system. They are responsible for the entire lifecycle of the counseling session, from document intake to local data management. They perform all administrative tasks (e.g managing session history) and operational tasks (e.g uploading documents and reviewing AI analysis).

* **Indirect Beneficiaries**: Grade 10 and Senior High School Students

  Does not interact with the software. Provides physical documents (NCAE/NAT) and receives the final PDF report.

## ***2.4. 	Constraints*** {#2.4.-constraints}

* **Data Privacy Compliance:**  
  The system must comply with the Data Privacy Act of 2012 (R.A. 10173). Student academic records (e.g., Form 137, NCAE, NAT) are classified as personal information. All personally identifiable information (PII) must be redacted from uploaded documents before any data is sent to the external LLM API. No student-identifiable data may be transmitted to external servers under any deployment configuration.  
* **Hardware and Performance Constraints**  
  The system must operate on standard school hardware without requiring dedicated GPU infrastructure. A full end-to-end session, from counselor-confirmed submission to PDF report generation, must complete within five (5) minutes under target hardware conditions. Performance is not guaranteed on devices below the minimum specification.  
* **Software and Infrastructure Constraints**  
  The system requires a modern web browser and a stable internet connection on the counselor's workstation. The indexed vector store must be pre-built and available on the deployment machine prior to use. Limited or unavailable network connectivity will impair API-dependent functions including LLM inference and live labor market data retrieval.  
* **Document Quality and Input Constraints**  
  The document extraction pipeline must handle variations in image quality (e.g., blur, lighting, layout differences). However, extraction accuracy cannot be guaranteed below the defined threshold when input quality is poor. The system performs best when all required documents (Form 137, NCAE, NAT) are provided; missing inputs will reduce the completeness of generated recommendations.  
* **Internet Dependency**   
  The system requires a stable internet connection during counseling sessions for two purposes: Gemini API calls for document extraction and agent inference, and Supabase queries for knowledge base retrieval. If either service is unreachable during a session, the affected function cannot proceed and the counselor must be notified. The knowledge base acquisition pipeline also requires internet access when it runs on its defined refresh schedule, but this occurs outside of counseling hours and is the responsibility of the technical administrator.   
* **Regulatory and Usage Constraints**  
  The system is intended solely as a decision-support tool for licensed guidance counselors. It does not replace formal counseling sessions or issue official career certifications. Outputs are advisory and must not be used as sole determinants for student decisions.  
* **Scope Constraints**  
  The system is designed for Grade 10 students selecting Senior High School tracks and SHS Students. Use outside this population (e.g., college-level advising or non-standard academic records) is outside the defined scope of this specification.

## ***2.5. 	Assumptions and dependencies*** {#2.5.-assumptions-and-dependencies}

**Assumptions**

* **User Qualifications:** The counselor is assumed to be PRC-licensed and has completed a basic system walkthrough. No advanced technical or AI training is required.  
* **Document Integrity:** Input documents (Form 137, NCAE, NAT) are assumed to be legible photographs or scans of official records. Accuracy may decrease if images are blurred, poorly lit, or obstructed.  
* **Pre-Deployment Setup:** It is assumed that a technical staff member has already performed the one-time setup, including  configuring the local application environment, indexing the vector store, and ensuring the hardware meets minimum specs.  
* **Data Recency:** PSA OpenSTAT and DOLE BLE LMI data are refreshed on a quarterly schedule aligned with PSA Labor Force Survey releases. CHED Memorandum Order data is refreshed per new publication. TESDA program cost data is reviewed and updated manually once per semester by the technical administrator. Recommendations generated during any session reflect the state of the vector store at the time of that session's counselor approval, as recorded by each record's ingestion timestamp.   
* **Standard Formats:** The system assumes that test results follow standard DepEd formats. The extraction pipeline may not correctly parse non-standard or third-party assessment layouts.

**Dependencies**

* **Multimodal LLM:** The system depends on a third-party hosted "Vision \+ Text" AI model accessed via API. If this model is changed or updated, the system's "instructions" (prompt engineering) may need to be recalibrated to maintain accuracy.  
* **Cloud-hosted Vector Store:** The career advice depends on a pre-indexed database of job and school info. If this database is corrupted or missing, the analysis engine will fail to provide relevant recommendations.  
* **PDF Rendering Library:** Generating the final report depends on a server-side library within the local environment. If this library is misconfigured, the counselor will see results on-screen but will be unable to download the final document.

3. # **Specific Requirements** {#specific-requirements}

   1. ## ***External interface requirements*** {#external-interface-requirements}

### ***3.1.1.	Hardware interfaces*** {#3.1.1.-hardware-interfaces}

Kumpas is a cloud-hosted web application deployed on Vercel and requires no dedicated server hardware on the school's premises. The counselor-facing client device must meet the following requirements to access and operate the system:

The client device must run one of the following minimum browser versions: Google Chrome 100 or later, Mozilla Firefox 100 or later, Microsoft Edge 100 or later, or Safari 15 or later. These requirements apply to both desktop and mobile devices, as the system is accessible from desktop computers, laptops, tablets, and smartphones.

The client device must maintain a stable internet connection throughout the counseling session, as the system depends on continuous connectivity to the Vercel-hosted server, the Gemini API, and the Supabase API during active sessions.

All academic documents — photographs of Form 137, NCAE result sheets, and NAT score sheets — are supplied to the system exclusively through the browser-based file upload interface. The counselor is responsible for producing these images externally, either by photographing documents with a mobile device or scanning them using any available scanner, and uploading the resulting files through the intake interface. Accepted file formats are JPEG, PNG, WEBP, and PDF, with a maximum file size of 10MB per document. No peripheral driver, scanning protocol, or device bridge is required or supported by the application.

For printing, the system interfaces with any printer accessible to the client device through the host operating system's native print dialog, triggered from the browser when the counselor chooses to print the generated PDF report. No additional driver or protocol configuration is required on the application side beyond what the operating system already exposes to the browser.

### ***3.1.2.	Software interfaces*** {#3.1.2.-software-interfaces}

Kumpas depends on the following software interfaces:

The frontend and backend are both implemented within a single Next.js application deployed on Vercel. The frontend renders the counselor-facing UI and manages client-side session state across all five modules. The backend, implemented via Next.js API routes and executed as Vercel serverless functions, handles document intake, orchestrates the PII redaction pipeline, manages all outbound API calls, coordinates Supabase vector store queries, and compiles the final PDF report. No separate backend framework or infrastructure is required.

The system interfaces with the Google Gemini API as its multimodal AI backbone. The Next.js backend transmits redacted document images and structured prompt payloads to the Gemini API via authenticated HTTPS POST requests. The API serves two distinct functions within the system: multimodal academic data extraction in Module 2, where redacted document images are parsed to populate structured academic data fields, and multi-agent career analysis in Module 3, where each of the three specialist agents — the Academic Auditor, the Industry Analyst, and the Feasibility Strategist — submits independent inference requests grounded in RAG-retrieved context from their respective knowledge silos. All responses are received as JSON and parsed by the backend pipeline. It is a strict and non-negotiable architectural requirement that the PII redaction pipeline must fully complete server-side before any document image or extracted text is transmitted to this interface. This is the sole mechanism by which the system maintains compliance with the Data Privacy Act of 2012 (R.A. 10173). Under no circumstances shall unredacted document content be submitted to the Gemini API under any deployment configuration.

The system interfaces with Supabase as its cloud-hosted vector store, utilizing the pgvector extension to perform similarity searches across three federated and decoupled knowledge silos: Market Analytics, Live Labor Demand, and Path Feasibility. The Next.js backend communicates with Supabase via its REST API and PostgreSQL client over authenticated HTTPS connections, querying the designated silo for each specialist agent during the Module 3 analysis phase. The Supabase instance contains only publicly sourced government data acquired through three documented tiers: automated structured-file downloads from PSA OpenSTAT for occupational employment data, automated PDF parsing of publicly downloadable DOLE BLE LMI reports and CHED Memorandum Orders, and manual curation of TESDA program cost and tuition benchmarks. Each indexed record retains its source reference, acquisition method, and ingestion timestamp. No student data is stored in or transmitted to Supabase under any deployment configuration, and its external hosting therefore raises no compliance concerns under R.A. 10173\. Supabase project credentials must be configured in the Vercel environment variables, and all knowledge silos must be fully populated through the acquisition pipeline prior to any live counseling session being conducted.

The system has no interface with a Student Information System in the current version. SIS integration is deferred to a future release.

### ***3.1.3.	Communications interfaces*** {#3.1.3.-communications-interfaces}

Kumpas requires a stable internet connection on the counselor's client device throughout all active counseling sessions. The counselor accesses the application through a modern web browser over HTTPS, communicating with the Next.js application server hosted on Vercel. All data exchanged between the client browser and the Vercel-hosted server is encrypted in transit via HTTPS.

The system has two session-time external network dependencies beyond the Vercel hosting layer. The first is the Google Gemini API, which is called by the backend for document extraction in Module 2 and for all three specialist agent inferences in Module 3\. The second is the Supabase API, which is queried by the backend for federated knowledge base retrieval during Module 3 analysis. Both dependencies are reached via authenticated HTTPS. If either service is unreachable during an active session, the affected pipeline function cannot proceed and the counselor must be notified immediately with a specific error identifying which external dependency is unavailable.

The knowledge base acquisition pipeline — which downloads structured datasets from PSA OpenSTAT, parses publicly available DOLE BLE LMI publications and CHED Memorandum Orders, and incorporates manually curated TESDA program cost records into the Supabase vector store — also requires internet access. This pipeline operates on a defined administrative refresh schedule outside of active counseling hours and is the exclusive responsibility of the technical administrator. It does not execute during live counseling sessions and must not be triggered concurrently with an active session to avoid degrading query performance against the Supabase instance.

No student data is transmitted to any external destination other than the Gemini API, and only after confirmed server-side PII redaction. All session-time external communications are conducted exclusively over HTTPS to ensure transport-layer encryption of all data in transit.

2. ## ***Functional requirements*** {#functional-requirements}

### ***Module 1*** {#module-1}

1. #### 	*1.1 PSA OpenSTAT CSV Ingestion*

* ##### *Use Case Diagram*

![][image1]

* ##### *Use Case Description*

**Use Case Name:** Automated LFS Occupational Data Acquisition

**Primary Actor:** Quarterly Scheduler

**Secondary Actors:** PSA OpenSTAT,  Database (Silo)

**Brief Description:** On a quarterly basis, the system automatically downloads the latest Labor Force Survey (LFS) CSV dataset from PSA OpenSTAT, parses it using pandas to extract occupation-sector employment records, embeds the chunks using a sentence-level model, and upserts them into the Supabase occupational knowledge silo with full provenance metadata.

**Pre-conditions:** The PSA OpenSTAT endpoint hosting the LFS CSV dataset is publicly accessible. The database (silo) is initialized and accepting write operations. The sentence-level embedding model is loaded and operational.

**Post-conditions:** At least 10 occupation-sector employment records have been upserted into the occupational silo. Each record carries its source URL, acquisition method (automated CSV download), and ingestion timestamp. The most recent ingestion timestamp is updated and visible in the counselor interface.

**Main Flow:**

1. The quarterly scheduler triggers the pipeline job.  
2. The system sends an HTTP GET request to the PSA OpenSTAT CSV endpoint.  
3. The system loads the downloaded file using pandas.  
4. The system extracts occupation-sector employment records from the parsed dataframe.  
5. The system splits records into text chunks.  
6. The system embeds each chunk using a sentence-level embedding model.  
7. The system upserts all records into the database, attaching source URL, acquisition method, and ingestion timestamp.  
8. The system updates the ingestion timestamp displayed in the counselor interface.

**Alternative Flow:**

1a. Download Failure: If the HTTP request fails or returns a non-200 response, the system logs the error and alerts the technical administrator. No records are written to the silo.

* ##### *Activity Diagram* 

![][image2]

2. #### *1.2 DOLE BLE / CHED PDF Parsing & Ingestion*

* ##### *Use Case Diagram*

![][image3] 

* ##### *Use Case Description*

**Use Case Name:** Automated LMI and CMO PDF Acquisition

**Primary Actor:** Weekly Scheduler

**Secondary Actors:** DOLE BLE / CHED, Database (Silo)

**Brief Description:** On a weekly basis, the system checks DOLE BLE and CHED publication indexes for newly released PDFs. When a new publication is detected, it is downloaded, extracted via pdfplumber with headers, footers, and page numbers stripped, chunked, embedded, and upserted into the corresponding knowledge silo with provenance metadata.

**Pre-conditions:** DOLE BLE and CHED publication indexes are accessible for change detection. pdfplumber is available and configured for extraction. Database is initialized and accepting write operations.

**Post-conditions:** Newly published LMI reports and CHED Memorandum Orders have been parsed and stored as vector records. Each record carries its source URL, acquisition method (automated PDF parsing), and ingestion timestamp. If no new publication is detected, the database remains unchanged and the run is logged as a no-op.

**Main Flow:**

1. The weekly scheduler triggers the pipeline job.  
2. The system checks the DOLE BLE and CHED publication indexes for new entries since the last ingestion timestamp.  
3. A new publication is detected.  
4. The system downloads the PDF document over HTTPS.  
5. The system extracts raw text using pdfplumber.  
6. The system strips headers, footers, and page numbers from the extracted text.  
7. The system splits the cleaned text into chunks.  
8. The system embeds each chunk using a sentence-level embedding model.  
9. The system upserts all records into the database with source URL, acquisition method, and ingestion timestamp.  
10. The system updates the ingestion timestamp in the counselor interface.

**Alternative Flows:**

2a. No New Publication: If no new entry is detected in step 2, the system logs the run as a no-op and terminates without modifying the silo.

4a. Download Failure: If the PDF download fails, the system logs the error, alerts the technical administrator, and terminates without writing to the silo.

* ##### *Activity Diagram*

  ![][image4]

#### 	*1.3 Manual TESDA Cost Curation & Ingestion*

* ##### *Use Case Diagram*

![][image5]

* *Use Case Description*

**Use Case Name:** Manual TESDA Program Cost Curation

**Primary Actor:** Technical Administrator

**Secondary Actors:** Database

**Brief Description:** Each semester, the technical administrator manually reviews TESDA program cost and tuition benchmark records and enters them into a structured curation template. Validated records are embedded and upserted into the database with full provenance metadata.

**Pre-conditions:** Current TESDA program cost and tuition records are available for review (e.g., from the TESDA website or official publications).The structured curation template is available and correctly formatted. The database is initialized and accepting write operations.

**Post-conditions:** At least 30 TESDA program cost records have been ingested into the TESDA knowledge silo. Each record carries its source reference, acquisition method (manual curation), and ingestion timestamp.The ingestion timestamp is updated and visible in the counselor interface.

**Main Flow:**

1. The semester curation cycle begins, prompting the technical administrator.  
2. The administrator reviews current TESDA program cost and tuition benchmark records from official sources.  
3. The administrator enters each record into the structured curation template.  
4. The system validates the record for completeness and format correctness.  
5. Validation passes.  
6. The system embeds the records using a sentence-level embedding model.  
7. The system upserts the records into the database with source reference, acquisition method, and ingestion timestamp.  
8. The system updates the ingestion timestamp in the counselor interface.

**Alternative Flow:**

4a. Validation Failure: If a record fails validation (missing required fields or incorrect format), the system flags the invalid fields and returns the record to the administrator for correction before re-attempting validation.

* *Activity Diagram*

*![][image6]* 

### ***Module 2*** {#module-2}

3. #### *2.1 Document Intake and Automatic Redaction*

* ##### *Use Case Diagram*

  ![][image7] 

* ##### *Use Case Description*

**Use Case Name:** Document Intake and Automatic Redaction   
**Primary Actor:** Guidance Counselor  
**Brief Description:** The counselor uploads academic document images and inputs session notes through the browser interface. The system immediately strips all personally identifiable information (PII) before the data can proceed to external processing.  
**Pre-conditions:**

* The counselor is authenticated and has the student's documents ready.

**Post-conditions:**

* Student names, birthdates, and ID numbers are completely redacted from all images. Redacted images are queued for extraction.

**Main Flow:**

1. The counselor accesses the intake interface via a standard web browser.    
2. The counselor uploads up to three document types (Form 137, NCAE sheet, NAT sheet) as image files.   
3. The counselor inputs session notes into five structured text fields (Career Goal, Personal Interests and Strengths, Family and Financial Situation, Concerns and Red Flags, and Counselor's Overall Impression).   
4. The counselor submits the intake form.  
5. The system applies named-entity recognition or pattern-matching to redact PII from the images.  
6. The system queues the anonymized images for the extraction pipeline.

* ##### *Activity Diagram*

![][image8] 

* ##### *Wireframe*

![][image9]

*2.1a Upload documents as images*

![][image10]

*2.1b Input session notes into five structured fields*

4. #### *2.2 Al Extraction and Counselor Confirmation*

* ##### *Use Case Diagram* 

![][image11] 

* ##### *Use Case Description*

**Use Case Name:** Al Extraction and Counselor Confirmation  
**Primary Actor:** System  
**Secondary Actor:** Gemini API, Guidance Counselor  
**Brief Description:** The system passes the anonymized images to the Gemini API to extract academic data. The counselor reviews the extracted values in an editable interface, makes necessary corrections, and explicitly approves the final data record to initiate the analysis phase.  
**Pre-conditions:**

* Redacted document images are successfully queued from Transaction 2.1.

**Post-conditions:**

* A verified, structured data record is finalized, appended with a session timestamp, and passed to Module 3\. Any manual edits made by the counselor are logged.

**Main Flow:**

1. The system transmits the redacted document images to the Gemini API.    
2. The API parses the images and populates a structured data record (final grades, NCAE subscores, NAT composite score).    
3. The system renders all extracted values into a counselor-facing editable confirmation screen.    
4. The counselor reviews the extracted values.    
5. The counselor edits and corrects any misidentified values directly in the interface.  
6. The system logs any field corrections made by the counselor.    
7. The counselor explicitly approves the data record.   
8. The system attaches a session timestamp to the unified profile and queues it for Module 3\.

* ##### *Activity Diagram*

![][image12] 

* ##### *Wireframe*

![][image13]  
*2.2 Extraction and editable interface*

### ***Module 3*** {#module-3}

5. #### *3.1 Federated Multi-Agent Analysis* 

* ##### *Use Case Diagram*

![][image14] 

* ##### *Use Case Description*

**Use Case Name:** Federated Multi-Agent Analysis  
**Primary Actor:** System  
**Secondary Actors:** Gemini API, Vector Database  
**Brief Description:** Upon receiving the counselor-approved student profile, the system dispatches the data to three independent reasoning agents: the Academic Auditor, the Industry Analyst, and the Feasibility Strategist. Each agent queries its specific, decoupled knowledge silo via a Retrieval-Augmented Generation (RAG) architecture and uses the Gemini API to generate an independent analysis.   
**Pre-conditions:** Module 2 has produced a verified, timestamped student profile object. The knowledge base has been populated and indexed.   
**Post-conditions:** Three distinct, independent analytical outputs are produced by the specialist agents.  
**Main Flow:**

1. The System receives the confirmed student profile.   
2. The system simultaneously distributes the profile to three independent reasoning agents.   
3. The Academic Auditor analyzes the academic performance data.   
4. The Industry Analyst queries the Live Labor Demand silo of the vector database for market context.   
5. The Feasibility Strategist queries the Path Feasibility silo for scholarship and cost context.   
6. Each agent utilizes the Gemini API to generate independent insights based exclusively on its assigned knowledge source.   
7. The system collects the three independent outputs and queues them for synthesis.

* ##### *Activity Diagram*

![][image15]    

* ##### *Wireframe*

![][image16]

6. #### *3.2 Meta-Agent Convergence and Ranking*

* ##### *Use Case Diagram*

![][image17] 

* ##### *Use Case Description*

**Use Case Name:** Meta-Agent Convergence and Ranking  
**Primary Actor:** System  
**Secondary Actor:** Gemini API  
**Brief Description:** The system executes a meta-agent synthesis step that takes the independent insights from the three specialist agents and converges them into a unified, ranked list of career path recommendations.   
**Pre-conditions:** All three specialist agents from Transaction 3.1 have successfully returned their independent insights.  
**Post-conditions:** A unified list of at least three distinct ranked career recommendations is produced and queued for Module 4\.    
**Main Flow:**

1. The System passes the three independent agent outputs to the meta-agent.   
2. The meta-agent synthesizes the conflicting or complementary insights.  
3. The meta-agent cross-references longitudinal subject mastery against high-growth sector demands and financial feasibility to calculate an Aptitude-Demand Alignment Score.   
4. The meta-agent produces a unified list of career paths, ranked by their alignment scores.   
5. The ranked list is queued for Module 4 (Explainable Report Generation).

* ##### *Activity Diagram*

![][image18] 

* ##### *Wireframe*

![][image19]

*3.2 Synchronize all outputs to provide scores and career path*

### ***Module 4*** {#module-4}

7. #### *4.1 Explainable Report Generation*

* ##### *Use Case Diagram*

![][image20] 

* ##### *Use Case Description*

**Use Case Name:** Explainable Report Generation

**Primary Actor:** System Backend

**Brief Description:** The system takes the ranked career paths and the Chain-of-Thought (CoT) reasoning traces produced by the agents in Module 3 and compiles them into a structured, human-readable PDF document.

**Pre-conditions:** Module 3 has successfully produced a ranked list of career paths accompanied by explicitly generated reasoning traces.

**Post-conditions:** A completely rendered, downloadable PDF document is generated on the local server, containing all required explainability artifacts.

**Main Flow:**

1. The System Backend receives the queued ranked recommendations and CoT traces.  
2. The system formats the plain-language reasoning summaries for the top three career paths.    
3. The system constructs the "Audit Trail" section, visually linking each recommendation to specific data inputs, retrieved sources, and their collection timestamps.    
4. The system embeds the numerical Aptitude-Demand Alignment Score for each path.    
5. The system utilizes a local PDF rendering library to generate the final document file.  
6. The system queues the PDF file for counselor retrieval.

* ##### *Activity Diagram*

![][image21]  

* ##### *Wireframe*

![][image22]  
![][image23]

8. #### *4.2 Report Presentation and Download*

* ##### *Use Case Diagram*

![][image24] 

* ##### *Use Case Description*

**Use Case Name:** Report Presentation and Download

**Primary Actor:** Guidance Counselor

**Brief Description:** The system transitions the browser UI from the Module 3 loading state to a completion state, allowing the counselor to immediately download the generated PDF report to their local machine without any backend intervention.

**Pre-conditions:** The PDF document has been successfully rendered and queued by Transaction 4.1.

**Post-conditions:** The PDF file is downloaded to the counselor's local machine, and the career alignment session is marked complete.

**Main Flow:**

1. The System Backend signals to the frontend that generation is complete.  
2. The system updates the browser interface, presenting a success state and a download button.  
3. The counselor clicks the download button.  
4. The system serves the generated PDF file over HTTP.    
5. The counselor saves the file locally.

* ##### *Activity Diagram*

![][image25]  

* ##### *Wireframe*

![][image26]

### ***Module 5*** {#module-5}

9. #### *5.1 End-to-End Session Orchestration*

* ##### *Use Case Diagram*

![][image27] 

* ##### *Use Case Description*

**Use Case Name:** End-to-End Session Orchestration

**Primary Actor:** Guidance Counselor

**Brief Description:** The system integrates all prior modules into a single, continuous workflow. It manages the state transitions from document upload (Module 1/2) through agent analysis (Module 3\) to report download (Module 4), ensuring the counselor can complete the entire process entirely within a standard web browser without any command-line or backend intervention.  

**Pre-conditions:** The application is running, and the local Vector Database is accessible.

**Post-conditions:** A full career alignment session is completed, and the system interface is reset for the next student.

**Main Flow:**

1. The counselor clicks "Start New Session" in the browser interface.

2. The system seamlessly routes the counselor through the Intake and Confirmation screens (Modules 1 & 2).

3. Upon confirmation, the system automatically triggers the background multi-agent analysis (Module 3\) while rendering a dynamic progress interface.

4. Upon synthesis completion, the system transitions directly to the report download screen (Module 4).


5. The counselor clicks "End Session," and the system resets the UI state for a new student without requiring a browser refresh or server restart.

* ##### *Activity Diagram*

![][image28] 

* ##### *Wireframe*

![][image29]

![][image30]

![][image31]  
![][image32]

10. #### *5.2  Local Data and Privacy Management*

* ##### *Use Case Diagram*

![][image33] 

* ##### *Use Case Description*

**Use Case Name:** Local Data and Privacy Management

**Primary Actor:** System Backend

**Brief Description:** To comply strictly with the Data Privacy Act of 2012 (R.A. 10173), the system manages local data lifecycle events. It permanently purges unredacted document images from local memory immediately after the automatic redaction step, and securely archives the system logs (such as the counselor's field corrections from Module 2\) locally for system performance evaluation. 

**Pre-conditions:** A session has either been completed, cancelled, or timed out.

**Post-conditions:** All temporary raw student images containing personally identifiable information (PII) are permanently deleted from the host machine. 

**Main Flow:**

1. The system detects a session termination event (completion, manual cancellation, or timeout).  
2. The system locates any cached, unredacted raw image files of Form 137, NCAE, or NAT documents.  
3. The system executes a permanent deletion command for these raw files, ensuring no PII remains in local memory.  
4. The system saves the timestamped counselor correction logs locally for future system accuracy evaluation.  
5. The system finalizes the cleanup protocol.

* ##### *Activity Diagram*

![][image34] 

* ##### *Wireframe*

![][image35]  
![][image36]

3. ## ***Non-Functional requirements*** {#non-functional-requirements}

### ***Performance*** {#performance}

**Processing Time** A full end-to-end session, from the knowledge base query through document upload, extraction, confirmation, agent analysis, and PDF report download, must not exceed five minutes on the target hardware.


### ***Security*** {#security}

**Regulatory Compliance** The system must strictly adhere to the Data Privacy Act of 2012 (R.A. 10173\) concerning the handling of student personal information.  

**Data Redaction** The automatic PII redaction pipeline must strip student names, birthdates, and ID numbers from all uploaded images before they are transmitted to the external extraction pipeline.  

**External API Protections** The system leverages Google's paid-tier Gemini API, which explicitly ensures that submitted prompts and responses are not used for underlying model training.

### ***Reliability*** {#reliability}

**Graceful Degradation on Missing Academic Documents** The session notes provided by the counselor constitute the minimum required input for the system to initiate analysis. The three academic document types (Form 137, NCAE, NAT) are optional supplementary inputs. If none or only some are provided, the system shall proceed with analysis using the available data without treating the absence as an error condition. The system shall clearly indicate to the counselor, in both the analysis interface and the generated PDF report, which academic data dimensions are absent and how this affects the evidential completeness of the recommendations. 

**Agent Failure Recovery** If one specialist agent (Academic Auditor, Industry Analyst, or Feasibility Strategist) fails to produce a valid output after one automatic retry, the system shall generate a partial recommendation set using the outputs of the remaining agents, notify the counselor of the failure, and mark the affected recommendations as incomplete rather than presenting them as fully evidenced.

**Data Fallback** If the system cannot retrieve labor market data due to an unavailable internet connection, it shall fall back automatically to the most recently cached version of the Live Labor Demand silo. The system shall display a clearly visible notice to the counselor identifying that cached data is in use and stating the cache date so the counselor can make an informed judgment about recommendation recency.

**Extraction Accuracy Floor** The multimodal LLM extraction routine shall achieve a field-level extraction accuracy of at least 85% across a test set of ten sample documents, as measured by comparing extracted values to a manually encoded ground truth during the MVP demonstration. Fields extracted below this threshold across the test set shall be investigated and addressed before the system is cleared for live counseling sessions.

**Session State Preservation** If a counselor's browser session times out or is interrupted between Module 2 and Module 4, the system shall preserve the last confirmed state (approved data record and any completed agent outputs) as a resumable draft. Upon re-authentication, the counselor shall be returned to the point of interruption without requiring re-entry of confirmed data.

**Data Consistency Across Modules** The canonical student profile object approved by the counselor in Module 2 shall propagate unchanged to Modules 3 and 4\. No module shall modify the approved profile object; each module shall only read from it and produce its own output. This ensures that the Audit Trail in the PDF report accurately reflects the data the counselor approves.

[image1]: docs/images/srs/image1.png

[image2]: docs/images/srs/image2.png

[image3]: docs/images/srs/image3.png

[image4]: docs/images/srs/image4.png

[image5]: docs/images/srs/image5.png

[image6]: docs/images/srs/image6.png

[image7]: docs/images/srs/image7.png

[image8]: docs/images/srs/image8.png

[image9]: docs/images/srs/image9.png

[image10]: docs/images/srs/image10.png

[image11]: docs/images/srs/image11.png

[image12]: docs/images/srs/image12.png

[image13]: docs/images/srs/image13.png

[image14]: docs/images/srs/image14.png

[image15]: docs/images/srs/image15.png

[image16]: docs/images/srs/image16.png

[image17]: docs/images/srs/image17.png

[image18]: docs/images/srs/image18.png

[image19]: docs/images/srs/image19.png

[image20]: docs/images/srs/image20.png

[image21]: docs/images/srs/image21.png

[image22]: docs/images/srs/image22.png

[image23]: docs/images/srs/image23.png

[image24]: docs/images/srs/image24.png

[image25]: docs/images/srs/image25.png

[image26]: docs/images/srs/image26.png

[image27]: docs/images/srs/image27.png

[image28]: docs/images/srs/image28.png

[image29]: docs/images/srs/image29.png

[image30]: docs/images/srs/image30.png

[image31]: docs/images/srs/image31.png

[image32]: docs/images/srs/image32.png

[image33]: docs/images/srs/image33.png

[image34]: docs/images/srs/image34.png

[image35]: docs/images/srs/image35.png

[image36]: docs/images/srs/image36.png