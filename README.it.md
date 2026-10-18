# Numbers Native

Plugin Codex e server MCP per usare **Apple Numbers nel suo formato nativo**, di **Viames Marino**, con licenza **MIT**.

[Sito](https://viames.github.io/numbers-native/) · [Download 0.5.0](https://github.com/viames/numbers-native/releases/tag/v0.5.0) · [Documentazione inglese](README.md) · [Supporto](https://github.com/viames/numbers-native/issues)

## Installazione in Codex

```sh
codex plugin marketplace add viames/numbers-native
codex plugin add numbers-native@viames-numbers
```

Avvia una nuova chat locale e usa la skill di configurazione. Nei client compatibili puoi anche aggiungere il repository `https://github.com/viames/numbers-native` da **Add plugin marketplace**.

Servono macOS, Apple Numbers, Node.js 22 o superiore e il permesso Automazione per consentire al programma ospitante di controllare Numbers. Non serve Accessibilità. Il bundle MCPB nella release espone gli stessi strumenti ai client compatibili; le skill sono incluse nel plugin Codex.

## Funzioni

- 38 strumenti per documenti, fogli, tabelle, formule native, formattazione di base e oggetti.
- Undici profili di grafici con collegamenti nativi conservati e aggiornamenti guidati.
- Modelli personalizzati `.numbers`, con formattazione e oggetti gestiti da Numbers.
- Modifiche su più tabelle con anteprima, revisione e verifica finale.
- Controlli di coerenza e importazione CSV/TSV con tipi espliciti e aggiornamento per chiave.
- Backup, ripristino e spostamento del documento insieme ai metadati dei grafici.
- Anteprime PDF/PNG native e diagnostica locale.

![Esempio sintetico verificato in Numbers](plugins/numbers-native/assets/demo.png)

## Limiti verificati

La 0.5.0 è una **prima versione pubblica di anteprima**, verificata su un Mac con Numbers 14.5. Non è una certificazione per tutte le versioni. Le operazioni non sono transazioni: un errore può seguire modifiche parziali. Non ripetere automaticamente le modifiche dopo errori o timeout.

L'API nativa non espone la modifica arbitraria di tipo, serie, assi e titolo interno dei grafici, né la creazione di pivot o regole condizionali. I grafici nuovi usano modelli nativi verificati. L'importazione è limitata a una tabella di 2.000 celle risultanti; le modifiche guidate scrivono fino a 2.000 celle per richiesta.

Nessuna conversione Excel, modifica del formato privato `.numbers`, automazione dell'interfaccia o telemetria. Dati e risultati passano comunque attraverso Codex e il suo modello secondo le regole del programma ospitante.

Consulta [funzioni e limiti](plugins/numbers-native/docs/CAPABILITIES.md), [verifiche](docs/VERIFICATION.md) e [privacy](https://viames.github.io/numbers-native/privacy.html).
