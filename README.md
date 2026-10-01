# Taskora

Monitoraggio delle attività dei dipendenti, divise per settore e progetto, con riepilogo e segnali per gli amministratori.

- **Interfaccia:** Angular 22 (componenti standalone, signals, nessuna libreria UI) in `src/`.
- **Server:** API PHP 8 + MySQL/MariaDB in `api/`.
- **Build:** `npm run build` crea una sola cartella `dist/` con interfaccia, API e `config.php`, pronta da caricare sul server.

## Pagine

L'app usa indirizzi con `#` (es. `index.html#/attivita`), così funziona in qualsiasi cartella del server senza regole di riscrittura.

| Indirizzo | Chi | Cosa |
| --- | --- | --- |
| `#/login` | tutti | Accesso |
| `#/dashboard` | tutti | Schede per settore, una colonna per dipendente e una card per progetto; nel dettaglio si aggiungono task, stato, avanzamento e ore |
| `#/attivita` | admin | Tabella di tutte le attività: filtri, ordinamento, modifica completa, completamento in blocco, eliminazione |
| `#/riepilogo` | admin | Andamento per dipendente e segnali da verificare, filtrabili per settore e periodo |
| `#/gestione` | admin | Utenti (creazione, nome visualizzato, ruolo, reset password), settori e progetti |

Dal menu utente ognuno può cambiare il proprio nome visualizzato e la password.

Ogni attività ha un **Owner del task** (chi deve svolgerla: per i dipendenti sono loro stessi, gli admin la possono assegnare a chiunque e cambiarlo dopo) e un **Assegnato da** (chi l'ha creata, impostato in automatico e non modificabile).

## Sviluppo

Serve Node 22.22.3 o più recente (consigliato Node 24) e PHP 8 con MySQL/MariaDB.

```bash
npm ci
# API PHP in un altro terminale, dalla cartella del progetto
DB_HOST=localhost DB_NAME=taskora DB_USERNAME=utente DB_PASSWORD=password php -S 127.0.0.1:8810
# interfaccia su http://localhost:4200 (le chiamate a /api passano al server PHP)
npm start
```

Su Windows, se PowerShell blocca `npm`, usa `npm.cmd` (es. `npm.cmd ci`).

Altri comandi:

- `npm test`: test unitari (Vitest).
- `npm run build`: build di produzione in `dist/`.

## Pubblicazione su Aruba

1. `npm run build` (oppure scarica l'artifact `taskora` dall'ultima esecuzione della GitHub Action **CI**).
2. Carica **il contenuto** di `dist/` nella cartella del sito, compreso il file nascosto `.htaccess`.
3. Sul server deve esserci `config.local.php` con le credenziali del database, accanto a `config.php` (vedi sotto). Non è nel repository e la build non lo tocca.

La cartella `storage/` viene creata da PHP alla prima richiesta: deve essere scrivibile.

### Arrivando da Jobtrack (versione con pagine HTML)

Il database è lo stesso: non serve nessuna migrazione. Dopo aver caricato `dist/`:

- `index.html` viene sostituito dalla nuova app: l'indirizzo del sito resta lo stesso.
- I vecchi indirizzi (`todolist.html`, `dashboard-inprogress.html`, `riepilogo.html`, `gestione.html`, `home.html`) portano da soli alla pagina corrispondente della nuova app (regole in `.htaccess` e, se il server le ignora, pagine con lo stesso nome che fanno il rimando).
- Si possono cancellare dal server i file della versione precedente: `dashboard-inprogress.html`, `todolist.html`, `riepilogo.html`, `gestione.html`, le cartelle `assets/` e `app/`, `README.md`, `.gitignore`.
- Da tenere: `config.local.php` e `storage/`.
- Se nella cartella c'era già un `.htaccess` con regole tue (es. redirect a https), unisci quelle regole al nuovo file invece di sovrascriverlo.

## Configurazione

Le credenziali del database **non** stanno nel repository. Usa una delle due strade:

1. variabili d'ambiente `DB_HOST`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`;
2. un file `config.local.php` accanto a `config.php`, copiato da `config.local.example.php`.

Le variabili d'ambiente hanno la precedenza. Senza configurazione l'API risponde con un errore 500 "Configurazione del server incompleta".

Su un'installazione nuova il primo amministratore (`admin`) viene creato solo se è impostata `ADMIN_INITIAL_PASSWORD` (o `admin_initial_password` in `config.local.php`).

## Aggiornamento del database

Le migrazioni partono da sole alla prima richiesta dopo un aggiornamento e vengono eseguite una sola volta per versione (`SCHEMA_VERSION` in `api/database.php`). Aggiungono colonne e tabelle senza toccare i dati esistenti.

## Sicurezza

- Password salvate con `password_hash()`; i vecchi hash MD5 vengono convertiti al primo accesso.
- Chi entra con una password debole, più corta di 8 caratteri o assegnata dall'admin deve cambiarla prima di continuare.
- Dopo 5 tentativi falliti per utente (o 20 per IP) l'accesso è bloccato per 15 minuti; il reset della password dalla gestione sblocca l'utente.
- L'API accetta solo JSON dallo stesso sito (niente CORS).
- `.htaccess` blocca l'accesso diretto a `config.php`, `config.local.php` e `storage/`.

## Registro eventi

Ogni modifica a un'attività finisce nella tabella `task_events` (chi, cosa, quando, valore prima e dopo). L'applicazione non modifica né cancella mai queste righe e le attività eliminate restano nel database (`deleted_at`). Il registro è visibile agli admin nel dettaglio del progetto e alimenta i segnali del riepilogo.
