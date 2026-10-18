# Privacy

Numbers Native is maintained by Viames Marino and distributed under MIT.

The local bridge reads and changes documents selected through its tools. It returns requested cell values, formulas, formatted text, document metadata and object information to the calling Codex/MCP host. That host can send this content to its model provider. Users should apply the host's privacy and data-retention policies when deciding which documents to use.

The bridge has no analytics, account system, remote storage, network listener or direct network upload. It does not request an additional OpenAI API key. Runtime dependencies are bundled; the bridge does not download code on launch.

CSV/TSV import reads an explicitly identified local UTF-8 source, prepares typed values and returns proposed/applied changes. Source bytes are hashed for preview consistency; no input archive or row history is persisted by the bridge. Guarded edit/check results include requested source values, formulas, violations and suspected errors; these pass through the MCP host like ordinary reads.

Apple Numbers saves and autosaves documents using the user's chosen locations, including iCloud locations where applicable. Numbers' own synchronization, external dependencies and Apple services are outside the plugin's control. Source changes may be persisted before an explicit save call. Native backups include valid companions; restore and move retarget them at explicit new paths. PDF/CSV exports and PDFKit PNG previews are created through their tools or an explicitly requested guided visual check. Preview images are returned to the MCP host and may be sent to its model. Diagnostics include OS/locale/runtime and installed-template information.

Tool requests travel to a fixed JXA worker over stdin; document contents are not interpolated into executable scripts. Temporary state includes a per-user process lock containing the bridge process ID. Managed chart documents and explicit chart registration also write an adjacent `.numbers-native.json` companion with binding names/IDs, source ranges, canonical document path and structural fingerprints (no cell matrices or formula history). These companions persist until removed and can be copied with native prototypes. Guided previews return relevant source-cell changes to the host. The bridge does not keep a document history or content log. The MCP host may log tool calls independently. Error diagnostics may include paths or native error messages.

By default, identified open documents and explicitly selected local file paths are accessible. Administrators/users can configure `NUMBERS_NATIVE_ALLOWED_ROOTS` as a JSON array of absolute directories. The bridge checks canonical paths, including native document IDs, before access; this setting does not sandbox the Numbers application itself.

Public privacy page: https://viames.github.io/numbers-native/privacy.html

Support and issue reporting: https://github.com/viames/numbers-native/issues. Do not include private spreadsheets or credentials in public reports. The project is maintained by Viames Marino; no guaranteed service-level agreement is offered.
