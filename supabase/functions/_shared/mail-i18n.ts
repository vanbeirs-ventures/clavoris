// Localised automated mails (en / nl / fr). The recipient's language is their clv_profiles.lang,
// chosen by the admin at invitation and changeable by the user under Account.
export type Lang = "en" | "nl" | "fr";
export const LANGS3: Lang[] = ["en", "nl", "fr"];
export function pickLang(l: unknown): Lang { return (LANGS3 as string[]).includes(String(l)) ? (l as Lang) : "en"; }

type V = Record<string, string | number | null | undefined>;
const fill = (s: string, v: V) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export const SIGNATURE: Record<Lang, string> = {
  en: "Clavoris · Private investment, enabled\nAntwerp · Luxembourg · Nordic\n\nThis mailbox is not monitored. For assistance write to access@clavoris.com.",
  nl: "Clavoris · Private investeringen, mogelijk gemaakt\nAntwerpen · Luxemburg · Nordics\n\nDeze mailbox wordt niet gelezen. Voor hulp schrijft u naar access@clavoris.com.",
  fr: "Clavoris · L'investissement privé, rendu possible\nAnvers · Luxembourg · Pays nordiques\n\nCette boîte n'est pas surveillée. Pour toute assistance, écrivez à access@clavoris.com.",
};

const T: Record<string, Record<Lang, { s: string; t: string }>> = {
  dear: { en: { s: "", t: "Dear {name}," }, nl: { s: "", t: "Beste {name}," }, fr: { s: "", t: "Cher/Chère {name}," } },
  room_invite_new: {
    en: { s: "Clavoris data room: {room}", t: "Dear {name},\n\nYou have been invited by {company} to the Clavoris data room \"{room}\".{until}\n\nTo activate your access: set your passphrase, complete your profile and the identity verification (KYC), then sign the room's non-disclosure agreement. Start here (the link is valid once):\n{link}\n\nAccess is personal and every document access is logged." },
    nl: { s: "Clavoris dataroom: {room}", t: "Beste {name},\n\nU bent door {company} uitgenodigd voor de Clavoris-dataroom \"{room}\".{until}\n\nOm uw toegang te activeren: kies uw wachtwoordzin, vul uw profiel aan en doorloop de identiteitsverificatie (KYC); onderteken daarna de geheimhoudingsovereenkomst van de dataroom. Begin hier (de link is eenmalig geldig):\n{link}\n\nDe toegang is persoonlijk en elke documentraadpleging wordt geregistreerd." },
    fr: { s: "Data room Clavoris : {room}", t: "Cher/Chère {name},\n\nVous êtes invité(e) par {company} à la data room Clavoris « {room} ».{until}\n\nPour activer votre accès : choisissez votre phrase de passe, complétez votre profil et la vérification d'identité (KYC), puis signez l'accord de confidentialité de la data room. Commencez ici (le lien est valable une seule fois) :\n{link}\n\nL'accès est personnel et chaque consultation de document est enregistrée." },
  },
  room_invite_linked: {
    en: { s: "Clavoris data room: {room}", t: "Dear {name},\n\nYou have been invited by {company} to the Clavoris data room \"{room}\".{until}\n\nYour e-mail address is already known to our group's platforms, so you can sign in to Clavoris with the passphrase you already use:\n{login}\n\nIf you prefer to set a new passphrase, use this one-time link:\n{link}\n\nAfter signing in, complete your profile and the identity verification (KYC), then sign the room's non-disclosure agreement. Access is personal and every document access is logged." },
    nl: { s: "Clavoris dataroom: {room}", t: "Beste {name},\n\nU bent door {company} uitgenodigd voor de Clavoris-dataroom \"{room}\".{until}\n\nUw e-mailadres is al bekend op de platformen van onze groep; u kunt zich bij Clavoris aanmelden met de wachtwoordzin die u al gebruikt:\n{login}\n\nWilt u liever een nieuwe wachtwoordzin instellen, gebruik dan deze eenmalige link:\n{link}\n\nVul na het aanmelden uw profiel aan en doorloop de identiteitsverificatie (KYC); onderteken daarna de geheimhoudingsovereenkomst van de dataroom. De toegang is persoonlijk en elke documentraadpleging wordt geregistreerd." },
    fr: { s: "Data room Clavoris : {room}", t: "Cher/Chère {name},\n\nVous êtes invité(e) par {company} à la data room Clavoris « {room} ».{until}\n\nVotre adresse e-mail est déjà connue des plateformes de notre groupe ; vous pouvez vous connecter à Clavoris avec la phrase de passe que vous utilisez déjà :\n{login}\n\nSi vous préférez définir une nouvelle phrase de passe, utilisez ce lien à usage unique :\n{link}\n\nAprès connexion, complétez votre profil et la vérification d'identité (KYC), puis signez l'accord de confidentialité de la data room. L'accès est personnel et chaque consultation de document est enregistrée." },
  },
  room_invite_existing: {
    en: { s: "Clavoris data room: {room}", t: "Dear {name},\n\nYou have been granted access by {company} to the Clavoris data room \"{room}\".{until}\n\nSign in to open it:\n{link}\n\nIf you have not yet completed identity verification, you will be guided through it first. The room's non-disclosure agreement must be signed before documents become available." },
    nl: { s: "Clavoris dataroom: {room}", t: "Beste {name},\n\nU hebt van {company} toegang gekregen tot de Clavoris-dataroom \"{room}\".{until}\n\nMeld u aan om ze te openen:\n{link}\n\nHebt u de identiteitsverificatie nog niet voltooid, dan wordt u daar eerst doorheen geleid. De geheimhoudingsovereenkomst van de dataroom moet ondertekend zijn voordat de documenten beschikbaar worden." },
    fr: { s: "Data room Clavoris : {room}", t: "Cher/Chère {name},\n\nL'accès à la data room Clavoris « {room} » vous a été accordé par {company}.{until}\n\nConnectez-vous pour l'ouvrir :\n{link}\n\nSi vous n'avez pas encore terminé la vérification d'identité, vous y serez d'abord guidé(e). L'accord de confidentialité de la data room doit être signé avant que les documents ne soient disponibles." },
  },
  user_enrolled_new: {
    en: { s: "Your Clavoris access", t: "Dear {name},\n\nClavoris has enrolled you as {role}.\n\nSet your passphrase and activate your access here (the link is valid once):\n{link}" },
    nl: { s: "Uw Clavoris-toegang", t: "Beste {name},\n\nClavoris heeft u ingeschreven als {role}.\n\nKies uw wachtwoordzin en activeer uw toegang hier (de link is eenmalig geldig):\n{link}" },
    fr: { s: "Votre accès Clavoris", t: "Cher/Chère {name},\n\nClavoris vous a inscrit(e) en tant que {role}.\n\nDéfinissez votre phrase de passe et activez votre accès ici (le lien est valable une seule fois) :\n{link}" },
  },
  user_enrolled_linked: {
    en: { s: "Your Clavoris access", t: "Dear {name},\n\nClavoris has enrolled you as {role}.\n\nYour e-mail address is already known to our group's platforms, so you can sign in to Clavoris with the passphrase you already use:\n{login}\n\nIf you prefer to set a new passphrase, use this one-time link:\n{link}" },
    nl: { s: "Uw Clavoris-toegang", t: "Beste {name},\n\nClavoris heeft u ingeschreven als {role}.\n\nUw e-mailadres is al bekend op de platformen van onze groep; u kunt zich bij Clavoris aanmelden met de wachtwoordzin die u al gebruikt:\n{login}\n\nWilt u liever een nieuwe wachtwoordzin instellen, gebruik dan deze eenmalige link:\n{link}" },
    fr: { s: "Votre accès Clavoris", t: "Cher/Chère {name},\n\nClavoris vous a inscrit(e) en tant que {role}.\n\nVotre adresse e-mail est déjà connue des plateformes de notre groupe ; vous pouvez vous connecter à Clavoris avec la phrase de passe que vous utilisez déjà :\n{login}\n\nSi vous préférez définir une nouvelle phrase de passe, utilisez ce lien à usage unique :\n{link}" },
  },
  role_investor: { en: { s: "", t: "a professional investor" }, nl: { s: "", t: "professionele belegger" }, fr: { s: "", t: "qu'investisseur professionnel" } },
  role_admin: { en: { s: "", t: "an administrator" }, nl: { s: "", t: "beheerder" }, fr: { s: "", t: "qu'administrateur" } },
  recovery: {
    en: { s: "Reset your Clavoris passphrase", t: "Dear {name},\n\nA passphrase reset was requested for your Clavoris account.\n\nSet a new passphrase here (the link is valid once, for a limited time):\n{link}\n\nIf you did not request this, you can ignore this message; your passphrase stays unchanged." },
    nl: { s: "Uw Clavoris-wachtwoordzin opnieuw instellen", t: "Beste {name},\n\nEr is gevraagd om de wachtwoordzin van uw Clavoris-account opnieuw in te stellen.\n\nStel hier een nieuwe wachtwoordzin in (de link is eenmalig en beperkt geldig):\n{link}\n\nHebt u dit niet gevraagd, dan kunt u dit bericht negeren; uw wachtwoordzin blijft ongewijzigd." },
    fr: { s: "Réinitialiser votre phrase de passe Clavoris", t: "Cher/Chère {name},\n\nUne réinitialisation de la phrase de passe a été demandée pour votre compte Clavoris.\n\nDéfinissez une nouvelle phrase de passe ici (le lien est valable une seule fois, pour une durée limitée) :\n{link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message ; votre phrase de passe reste inchangée." },
  },
  first_download: {
    en: { s: "Clavoris: your first download and the audit trail", t: "Dear {name},\n\nYou have started using the Clavoris data room \"{room}\" and downloaded your first document ({file}, download reference {code}).\n\nPlease note:\n- Every download is registered in an audit trail with your identity, the time, your network address and a cryptographic fingerprint of the delivered file.\n- Each delivered file carries a unique watermark identifying the download event and you as the recipient.\n- The documents are confidential under the non-disclosure agreement you signed. They may be used only for the agreed purpose and may not be shared, forwarded or reproduced.\n\nYou can consult your own audit trail at any time under Account › Audit trail:\n{audit}" },
    nl: { s: "Clavoris: uw eerste download en het auditspoor", t: "Beste {name},\n\nU bent de Clavoris-dataroom \"{room}\" beginnen gebruiken en hebt uw eerste document gedownload ({file}, downloadreferentie {code}).\n\nLet op:\n- Elke download wordt in een auditspoor geregistreerd met uw identiteit, het tijdstip, uw netwerkadres en een cryptografische vingerafdruk van het geleverde bestand.\n- Elk geleverd bestand draagt een uniek watermerk dat de download en u als ontvanger identificeert.\n- De documenten zijn vertrouwelijk onder de door u ondertekende geheimhoudingsovereenkomst. Ze mogen alleen voor het overeengekomen doel worden gebruikt en niet worden gedeeld, doorgestuurd of gereproduceerd.\n\nU kunt uw eigen auditspoor altijd raadplegen onder Account › Auditspoor:\n{audit}" },
    fr: { s: "Clavoris : votre premier téléchargement et la piste d'audit", t: "Cher/Chère {name},\n\nVous avez commencé à utiliser la data room Clavoris « {room} » et téléchargé votre premier document ({file}, référence de téléchargement {code}).\n\nVeuillez noter :\n- Chaque téléchargement est enregistré dans une piste d'audit avec votre identité, l'heure, votre adresse réseau et une empreinte cryptographique du fichier livré.\n- Chaque fichier livré porte un filigrane unique identifiant le téléchargement et vous-même comme destinataire.\n- Les documents sont confidentiels en vertu de l'accord de confidentialité que vous avez signé. Ils ne peuvent être utilisés que pour l'objet convenu et ne peuvent être partagés, transmis ou reproduits.\n\nVous pouvez consulter votre piste d'audit à tout moment sous Compte › Piste d'audit :\n{audit}" },
  },
  contract_added_new: {
    en: { s: "Clavoris: you have been added to a contract — {title}", t: "Dear {name},\n\nYou have been added as {role} to the contract \"{title}\" on Clavoris.\n\nTo activate your access, set your passphrase and complete your profile here (the link is valid once):\n{link}\n\n{tail}" },
    nl: { s: "Clavoris: u bent toegevoegd aan een contract — {title}", t: "Beste {name},\n\nU bent als {role} toegevoegd aan het contract \"{title}\" op Clavoris.\n\nOm uw toegang te activeren, kiest u hier uw wachtwoordzin en vult u uw profiel aan (de link is eenmalig geldig):\n{link}\n\n{tail}" },
    fr: { s: "Clavoris : vous avez été ajouté(e) à un contrat — {title}", t: "Cher/Chère {name},\n\nVous avez été ajouté(e) en tant que {role} au contrat « {title} » sur Clavoris.\n\nPour activer votre accès, définissez votre phrase de passe et complétez votre profil ici (le lien est valable une seule fois) :\n{link}\n\n{tail}" },
  },
  contract_added_linked: {
    en: { s: "Clavoris: you have been added to a contract — {title}", t: "Dear {name},\n\nYou have been added as {role} to the contract \"{title}\" on Clavoris.\n\nYour e-mail address is already known to our group's platforms, so you can sign in with the passphrase you already use:\n{login}\n\nIf you prefer to set a new passphrase, use this one-time link:\n{link}\n\n{tail}" },
    nl: { s: "Clavoris: u bent toegevoegd aan een contract — {title}", t: "Beste {name},\n\nU bent als {role} toegevoegd aan het contract \"{title}\" op Clavoris.\n\nUw e-mailadres is al bekend op de platformen van onze groep; u kunt zich aanmelden met de wachtwoordzin die u al gebruikt:\n{login}\n\nWilt u liever een nieuwe wachtwoordzin instellen, gebruik dan deze eenmalige link:\n{link}\n\n{tail}" },
    fr: { s: "Clavoris : vous avez été ajouté(e) à un contrat — {title}", t: "Cher/Chère {name},\n\nVous avez été ajouté(e) en tant que {role} au contrat « {title} » sur Clavoris.\n\nVotre adresse e-mail est déjà connue des plateformes de notre groupe ; vous pouvez vous connecter avec la phrase de passe que vous utilisez déjà :\n{login}\n\nSi vous préférez définir une nouvelle phrase de passe, utilisez ce lien à usage unique :\n{link}\n\n{tail}" },
  },
  role_signatory: { en: { s: "", t: "signatory" }, nl: { s: "", t: "ondertekenaar" }, fr: { s: "", t: "signataire" } },
  role_auditor: { en: { s: "", t: "auditor" }, nl: { s: "", t: "auditor" }, fr: { s: "", t: "auditeur" } },
  tail_signatory: { en: { s: "", t: "You will be notified when it is your turn to sign; the signature is a qualified electronic signature created with your verified identity." }, nl: { s: "", t: "U wordt verwittigd wanneer u aan de beurt bent om te ondertekenen; de handtekening is een gekwalificeerde elektronische handtekening op basis van uw geverifieerde identiteit." }, fr: { s: "", t: "Vous serez averti(e) lorsque ce sera votre tour de signer ; la signature est une signature électronique qualifiée créée à partir de votre identité vérifiée." } },
  tail_auditor: { en: { s: "", t: "You can follow the execution of the contract by all parties." }, nl: { s: "", t: "U kunt de uitvoering van het contract door alle partijen volgen." }, fr: { s: "", t: "Vous pouvez suivre l'exécution du contrat par toutes les parties." } },
  contract_your_turn: {
    en: { s: "Clavoris: your signature is requested — {title}", t: "Dear {name},\n\nThe contract \"{title}\" is ready for your qualified electronic signature (eIDAS). Sign in to Clavoris, read the document and sign it:\n{link}\n\nThe signature is created with your verified identity (Sumsub QES) and is legally equivalent to a handwritten signature across the EU." },
    nl: { s: "Clavoris: uw handtekening wordt gevraagd — {title}", t: "Beste {name},\n\nHet contract \"{title}\" is klaar voor uw gekwalificeerde elektronische handtekening (eIDAS). Meld u aan bij Clavoris, lees het document en onderteken het:\n{link}\n\nDe handtekening wordt aangemaakt met uw geverifieerde identiteit (Sumsub QES) en is in de hele EU juridisch gelijkwaardig aan een handgeschreven handtekening." },
    fr: { s: "Clavoris : votre signature est demandée — {title}", t: "Cher/Chère {name},\n\nLe contrat « {title} » est prêt pour votre signature électronique qualifiée (eIDAS). Connectez-vous à Clavoris, lisez le document et signez-le :\n{link}\n\nLa signature est créée à partir de votre identité vérifiée (Sumsub QES) et a, dans toute l'UE, la même valeur juridique qu'une signature manuscrite." },
  },
  contract_launched_wait: {
    en: { s: "Clavoris: contract awaiting signatures — {title}", t: "Dear {name},\n\nThe signature process of the contract \"{title}\" has started. You are signatory no. {order}; Clavoris will notify you when it is your turn. You can read the document and follow the process here:\n{link}" },
    nl: { s: "Clavoris: contract wacht op handtekeningen — {title}", t: "Beste {name},\n\nHet ondertekeningsproces van het contract \"{title}\" is gestart. U bent ondertekenaar nr. {order}; Clavoris verwittigt u wanneer u aan de beurt bent. U kunt het document lezen en het proces hier volgen:\n{link}" },
    fr: { s: "Clavoris : contrat en attente de signatures — {title}", t: "Cher/Chère {name},\n\nLe processus de signature du contrat « {title} » a commencé. Vous êtes le/la signataire n° {order} ; Clavoris vous avertira lorsque ce sera votre tour. Vous pouvez lire le document et suivre le processus ici :\n{link}" },
  },
  contract_launched_auditor: {
    en: { s: "Clavoris: contract in execution — {title}", t: "Dear {name},\n\nThe signature process of the contract \"{title}\" has started. As auditor you can follow the status of every party here:\n{link}" },
    nl: { s: "Clavoris: contract in uitvoering — {title}", t: "Beste {name},\n\nHet ondertekeningsproces van het contract \"{title}\" is gestart. Als auditor kunt u de status van elke partij hier volgen:\n{link}" },
    fr: { s: "Clavoris : contrat en cours d'exécution — {title}", t: "Cher/Chère {name},\n\nLe processus de signature du contrat « {title} » a commencé. En tant qu'auditeur, vous pouvez suivre le statut de chaque partie ici :\n{link}" },
  },
  contract_executed_signatory: {
    en: { s: "Clavoris: contract executed — {title}", t: "Dear {name},\n\nThe contract \"{title}\" has been executed by all parties with qualified electronic signatures. The executed PDF and the certificate of completion are available for download in Clavoris:\n{link}\n\nSHA-256 of the executed document: {sha}" },
    nl: { s: "Clavoris: contract uitgevoerd — {title}", t: "Beste {name},\n\nHet contract \"{title}\" is door alle partijen ondertekend met gekwalificeerde elektronische handtekeningen. De ondertekende pdf en het voltooiingscertificaat kunt u downloaden in Clavoris:\n{link}\n\nSHA-256 van het ondertekende document: {sha}" },
    fr: { s: "Clavoris : contrat exécuté — {title}", t: "Cher/Chère {name},\n\nLe contrat « {title} » a été signé par toutes les parties au moyen de signatures électroniques qualifiées. Le PDF signé et le certificat d'achèvement sont téléchargeables dans Clavoris :\n{link}\n\nSHA-256 du document signé : {sha}" },
  },
  contract_executed_auditor: {
    en: { s: "Clavoris: contract executed — {title}", t: "Dear {name},\n\nThe contract \"{title}\" has been executed by all parties with qualified electronic signatures. You can consult the execution record in Clavoris:\n{link}" },
    nl: { s: "Clavoris: contract uitgevoerd — {title}", t: "Beste {name},\n\nHet contract \"{title}\" is door alle partijen ondertekend met gekwalificeerde elektronische handtekeningen. U kunt het uitvoeringsdossier raadplegen in Clavoris:\n{link}" },
    fr: { s: "Clavoris : contrat exécuté — {title}", t: "Cher/Chère {name},\n\nLe contrat « {title} » a été signé par toutes les parties au moyen de signatures électroniques qualifiées. Vous pouvez consulter le dossier d'exécution dans Clavoris :\n{link}" },
  },
  sub_received: {
    en: { s: "Clavoris: subscription request received — {product}", t: "Dear {name},\n\nClavoris has received your subscription request for {units} unit(s) of {product}, for a total of {amount}.\n\nOur team reviews the request; you will be notified when it is accepted and when the subscription documentation is ready for your qualified electronic signature. Follow the status in your portfolio:\n{link}" },
    nl: { s: "Clavoris: inschrijvingsaanvraag ontvangen — {product}", t: "Beste {name},\n\nClavoris heeft uw inschrijvingsaanvraag ontvangen voor {units} eenhe(i)d(en) van {product}, voor een totaal van {amount}.\n\nOns team beoordeelt de aanvraag; u wordt verwittigd zodra ze aanvaard is en zodra de inschrijvingsdocumentatie klaar is voor uw gekwalificeerde elektronische handtekening. Volg de status in uw portefeuille:\n{link}" },
    fr: { s: "Clavoris : demande de souscription reçue — {product}", t: "Cher/Chère {name},\n\nClavoris a reçu votre demande de souscription de {units} unité(s) de {product}, pour un total de {amount}.\n\nNotre équipe examine la demande ; vous serez averti(e) de son acceptation et dès que la documentation de souscription sera prête pour votre signature électronique qualifiée. Suivez l'état dans votre portefeuille :\n{link}" },
  },
  sub_settled: {
    en: { s: "Clavoris: subscription settled — {product}", t: "Dear {name},\n\nYour subscription of {units} unit(s) of {product} ({amount}) has been settled. The position, its coupon schedule and the executed documentation are available in your portfolio:\n{link}" },
    nl: { s: "Clavoris: inschrijving afgewikkeld — {product}", t: "Beste {name},\n\nUw inschrijving op {units} eenhe(i)d(en) van {product} ({amount}) is afgewikkeld. De positie, het couponschema en de ondertekende documentatie vindt u in uw portefeuille:\n{link}" },
    fr: { s: "Clavoris : souscription réglée — {product}", t: "Cher/Chère {name},\n\nVotre souscription de {units} unité(s) de {product} ({amount}) a été réglée. La position, son échéancier de coupons et la documentation signée sont disponibles dans votre portefeuille :\n{link}" },
  },
  listing_matched: {
    en: { s: "Clavoris: buyer found for your listing — {product}", t: "Dear {name},\n\nA verified investor has accepted your listing of {units} unit(s) of {product} for {amount}. Clavoris now prepares the transfer documentation for qualified electronic signature by both parties and settles the trade afterwards. Follow the status in your portfolio:\n{link}" },
    nl: { s: "Clavoris: koper gevonden voor uw aanbod — {product}", t: "Beste {name},\n\nEen geverifieerde belegger heeft uw aanbod van {units} eenhe(i)d(en) van {product} voor {amount} aanvaard. Clavoris bereidt nu de overdrachtsdocumentatie voor ter gekwalificeerde elektronische ondertekening door beide partijen en wikkelt de transactie daarna af. Volg de status in uw portefeuille:\n{link}" },
    fr: { s: "Clavoris : acheteur trouvé pour votre offre — {product}", t: "Cher/Chère {name},\n\nUn investisseur vérifié a accepté votre offre de {units} unité(s) de {product} pour {amount}. Clavoris prépare à présent la documentation de cession pour signature électronique qualifiée par les deux parties, puis règle la transaction. Suivez l'état dans votre portefeuille :\n{link}" },
  },
  buy_matched: {
    en: { s: "Clavoris: purchase registered — {product}", t: "Dear {name},\n\nYour purchase of {units} unit(s) of {product} for {amount} has been registered. Clavoris now prepares the transfer documentation for qualified electronic signature by both parties and settles the trade afterwards. Follow the status in your portfolio:\n{link}" },
    nl: { s: "Clavoris: aankoop geregistreerd — {product}", t: "Beste {name},\n\nUw aankoop van {units} eenhe(i)d(en) van {product} voor {amount} is geregistreerd. Clavoris bereidt nu de overdrachtsdocumentatie voor ter gekwalificeerde elektronische ondertekening door beide partijen en wikkelt de transactie daarna af. Volg de status in uw portefeuille:\n{link}" },
    fr: { s: "Clavoris : achat enregistré — {product}", t: "Cher/Chère {name},\n\nVotre achat de {units} unité(s) de {product} pour {amount} a été enregistré. Clavoris prépare à présent la documentation de cession pour signature électronique qualifiée par les deux parties, puis règle la transaction. Suivez l'état dans votre portefeuille :\n{link}" },
  },
  trade_settled: {
    en: { s: "Clavoris: transfer settled — {product}", t: "Dear {name},\n\nThe transfer of {units} unit(s) of {product} ({amount}) has been settled. Your updated position and the executed documentation are available in your portfolio:\n{link}" },
    nl: { s: "Clavoris: overdracht afgewikkeld — {product}", t: "Beste {name},\n\nDe overdracht van {units} eenhe(i)d(en) van {product} ({amount}) is afgewikkeld. Uw bijgewerkte positie en de ondertekende documentatie vindt u in uw portefeuille:\n{link}" },
    fr: { s: "Clavoris : cession réglée — {product}", t: "Cher/Chère {name},\n\nLa cession de {units} unité(s) de {product} ({amount}) a été réglée. Votre position mise à jour et la documentation signée sont disponibles dans votre portefeuille :\n{link}" },
  },
  // ---- notifications (each category can be switched off by the user under Account) ----
  room_files: {
    en: { s: "Clavoris data room {room}: {what}", t: "Dear {name},\n\nThe data room \"{room}\" has been updated.\n{list}\nOpen the data room:\n{link}\n\nYou receive this message because file notifications are enabled on your account. You can change this under Account › E-mail notifications." },
    nl: { s: "Clavoris dataroom {room}: {what}", t: "Beste {name},\n\nDe dataroom \"{room}\" is bijgewerkt.\n{list}\nOpen de dataroom:\n{link}\n\nU ontvangt dit bericht omdat bestandsmeldingen op uw account ingeschakeld zijn. U kunt dit wijzigen onder Account › E-mailmeldingen." },
    fr: { s: "Data room Clavoris {room} : {what}", t: "Cher/Chère {name},\n\nLa data room « {room} » a été mise à jour.\n{list}\nOuvrir la data room :\n{link}\n\nVous recevez ce message parce que les notifications de fichiers sont activées sur votre compte. Vous pouvez modifier cela sous Compte › Notifications par e-mail." },
  },
  files_new: { en: { s: "", t: "new files" }, nl: { s: "", t: "nieuwe bestanden" }, fr: { s: "", t: "nouveaux fichiers" } },
  files_updated: { en: { s: "", t: "updated files" }, nl: { s: "", t: "bijgewerkte bestanden" }, fr: { s: "", t: "fichiers mis à jour" } },
  files_new_h: { en: { s: "", t: "New files:" }, nl: { s: "", t: "Nieuwe bestanden:" }, fr: { s: "", t: "Nouveaux fichiers :" } },
  files_updated_h: { en: { s: "", t: "Updated files:" }, nl: { s: "", t: "Bijgewerkte bestanden:" }, fr: { s: "", t: "Fichiers mis à jour :" } },
  contract_assigned: {
    en: { s: "Clavoris: contract for signature — {title}", t: "Dear {name},\n\nThe contract \"{title}\" has been assigned to you as {role} on Clavoris. You will be notified when it is your turn to sign; you can already consult it here:\n{link}" },
    nl: { s: "Clavoris: contract ter ondertekening — {title}", t: "Beste {name},\n\nHet contract \"{title}\" is op Clavoris aan u toegewezen als {role}. U wordt verwittigd zodra het uw beurt is om te ondertekenen; u kunt het hier al raadplegen:\n{link}" },
    fr: { s: "Clavoris : contrat à signer — {title}", t: "Cher/Chère {name},\n\nLe contrat « {title} » vous a été attribué sur Clavoris en tant que {role}. Vous serez prévenu(e) lorsque ce sera votre tour de signer ; vous pouvez déjà le consulter ici :\n{link}" },
  },
  market_new: {
    en: { s: "Clavoris: new investment available — {product}", t: "Dear {name},\n\nA new investment is open for subscription on the Clavoris marketplace:\n\n{product}\nIssuer: {issuer}\n{terms}\n\nFull documentation must be assessed before any subscription. Open the instrument:\n{link}\n\nThis message is addressed to professional investors only and does not constitute an offer to the public." },
    nl: { s: "Clavoris: nieuwe investering beschikbaar — {product}", t: "Beste {name},\n\nEen nieuwe investering staat open voor inschrijving op de Clavoris-marktplaats:\n\n{product}\nEmittent: {issuer}\n{terms}\n\nDe volledige documentatie moet beoordeeld zijn vóór elke inschrijving. Open het instrument:\n{link}\n\nDit bericht is uitsluitend gericht aan professionele beleggers en vormt geen openbaar aanbod." },
    fr: { s: "Clavoris : nouvel investissement disponible — {product}", t: "Cher/Chère {name},\n\nUn nouvel investissement est ouvert à la souscription sur la place de marché Clavoris :\n\n{product}\nÉmetteur : {issuer}\n{terms}\n\nLa documentation complète doit être évaluée avant toute souscription. Ouvrir l'instrument :\n{link}\n\nCe message s'adresse exclusivement aux investisseurs professionnels et ne constitue pas une offre au public." },
  },
  pf_event: {
    en: { s: "Clavoris portfolio: {kind} — {product}", t: "Dear {name},\n\n{title}\n\nInstrument: {product}\nEvent: {kind}{date}\nYour position: {units} unit(s){amount}\n\n{body}\n\nDetails in your portfolio:\n{link}" },
    nl: { s: "Clavoris portefeuille: {kind} — {product}", t: "Beste {name},\n\n{title}\n\nInstrument: {product}\nGebeurtenis: {kind}{date}\nUw positie: {units} eenhe(i)d(en){amount}\n\n{body}\n\nDetails in uw portefeuille:\n{link}" },
    fr: { s: "Clavoris portefeuille : {kind} — {product}", t: "Cher/Chère {name},\n\n{title}\n\nInstrument : {product}\nÉvénement : {kind}{date}\nVotre position : {units} unité(s){amount}\n\n{body}\n\nDétails dans votre portefeuille :\n{link}" },
  },
  ev_coupon: { en: { s: "", t: "coupon payment" }, nl: { s: "", t: "couponbetaling" }, fr: { s: "", t: "paiement de coupon" } },
  ev_custom: { en: { s: "", t: "notice" }, nl: { s: "", t: "mededeling" }, fr: { s: "", t: "avis" } },
  ev_maturity: { en: { s: "", t: "end of contract" }, nl: { s: "", t: "einde van het contract" }, fr: { s: "", t: "fin de contrat" } },
  ev_principal: { en: { s: "", t: "repayment of principal" }, nl: { s: "", t: "terugbetaling van de hoofdsom" }, fr: { s: "", t: "remboursement du principal" } },
  ev_conversion: { en: { s: "", t: "conversion into shares" }, nl: { s: "", t: "omzetting in aandelen" }, fr: { s: "", t: "conversion en actions" } },
  on_date: { en: { s: "", t: " on {date}" }, nl: { s: "", t: " op {date}" }, fr: { s: "", t: " le {date}" } },
  coupon_paid_title: { en: { s: "", t: "A coupon has been paid on your position." }, nl: { s: "", t: "Er is een coupon uitbetaald op uw positie." }, fr: { s: "", t: "Un coupon a été payé sur votre position." } },
  coupon_paid_body: { en: { s: "", t: "Coupon due {date}: {amount}{ref}. Your bank statement is the proof of receipt; Clavoris records the payment in your portfolio." }, nl: { s: "", t: "Coupon vervallen op {date}: {amount}{ref}. Uw bankuittreksel geldt als ontvangstbewijs; Clavoris registreert de betaling in uw portefeuille." }, fr: { s: "", t: "Coupon échu le {date} : {amount}{ref}. Votre relevé bancaire fait foi de réception ; Clavoris enregistre le paiement dans votre portefeuille." } },
  // ---- reminders sent by staff from the data-room member list ----
  remind_signup: {
    en: { s: "Reminder — your Clavoris access to {room}", t: "Dear {name},\n\nYour access to the Clavoris data room \"{room}\" is waiting for activation. Set your passphrase and complete your profile here (the link is valid once):\n{link}\n\nAfter that, the identity verification (KYC) and the room's non-disclosure agreement complete the process. Access is personal and every document access is logged." },
    nl: { s: "Herinnering — uw Clavoris-toegang tot {room}", t: "Beste {name},\n\nUw toegang tot de Clavoris-dataroom \"{room}\" wacht op activering. Kies hier uw wachtwoordzin en vul uw profiel aan (de link is eenmalig geldig):\n{link}\n\nDaarna voltooien de identiteitsverificatie (KYC) en de geheimhoudingsovereenkomst van de dataroom het proces. De toegang is persoonlijk en elke documentraadpleging wordt geregistreerd." },
    fr: { s: "Rappel — votre accès Clavoris à {room}", t: "Cher/Chère {name},\n\nVotre accès à la data room Clavoris « {room} » attend d'être activé. Choisissez votre phrase de passe et complétez votre profil ici (le lien est valable une seule fois) :\n{link}\n\nEnsuite, la vérification d'identité (KYC) et l'accord de confidentialité de la data room achèvent le processus. L'accès est personnel et chaque consultation de document est enregistrée." },
  },
  remind_kyc: {
    en: { s: "Reminder — identity verification for {room}", t: "Dear {name},\n\nYour identity verification (KYC) is still outstanding, so the Clavoris data room \"{room}\" cannot open yet. It takes a few minutes with an identity document and a phone or webcam:\n{link}\n\nOnce verified, the room's non-disclosure agreement is the last step before the documents become available." },
    nl: { s: "Herinnering — identiteitsverificatie voor {room}", t: "Beste {name},\n\nUw identiteitsverificatie (KYC) is nog niet voltooid, waardoor de Clavoris-dataroom \"{room}\" nog niet kan openen. Het duurt enkele minuten met een identiteitsdocument en een telefoon of webcam:\n{link}\n\nNa de verificatie is de geheimhoudingsovereenkomst van de dataroom de laatste stap voordat de documenten beschikbaar worden." },
    fr: { s: "Rappel — vérification d'identité pour {room}", t: "Cher/Chère {name},\n\nVotre vérification d'identité (KYC) est toujours en attente ; la data room Clavoris « {room} » ne peut donc pas encore s'ouvrir. Elle prend quelques minutes avec une pièce d'identité et un téléphone ou une webcam :\n{link}\n\nUne fois vérifié(e), l'accord de confidentialité de la data room est la dernière étape avant que les documents soient disponibles." },
  },
  remind_nda: {
    en: { s: "Reminder — non-disclosure agreement for {room}", t: "Dear {name},\n\nYour identity is verified; the non-disclosure agreement of the Clavoris data room \"{room}\" still awaits your signature. Sign it inside the room to open the documents:\n{link}" },
    nl: { s: "Herinnering — geheimhoudingsovereenkomst voor {room}", t: "Beste {name},\n\nUw identiteit is geverifieerd; de geheimhoudingsovereenkomst van de Clavoris-dataroom \"{room}\" wacht nog op uw ondertekening. Onderteken ze in de dataroom om de documenten te openen:\n{link}" },
    fr: { s: "Rappel — accord de confidentialité pour {room}", t: "Cher/Chère {name},\n\nVotre identité est vérifiée ; l'accord de confidentialité de la data room Clavoris « {room} » attend encore votre signature. Signez-le dans la data room pour ouvrir les documents :\n{link}" },
  },
  // ---- access end date, extension requests, expiry reminders ----
  until_line: { en: { s: "", t: "\nYour access runs until {date}." }, nl: { s: "", t: "\nUw toegang loopt tot {date}." }, fr: { s: "", t: "\nVotre accès court jusqu'au {date}." } },
  ext_requested: {
    en: { s: "[Clavoris] Access extension requested — {room}", t: "{name} ({email}, {org}) requests an extension of their access to the data room \"{room}\" until {date}.\n\nMessage: {message}\n\nAccept or reject under Admin › Data rooms:\n{link}" },
    nl: { s: "[Clavoris] Verlenging van toegang gevraagd — {room}", t: "{name} ({email}, {org}) vraagt een verlenging van de toegang tot de dataroom \"{room}\" tot {date}.\n\nBericht: {message}\n\nAanvaarden of weigeren onder Beheer › Datarooms:\n{link}" },
    fr: { s: "[Clavoris] Prolongation d'accès demandée — {room}", t: "{name} ({email}, {org}) demande une prolongation de son accès à la data room « {room} » jusqu'au {date}.\n\nMessage : {message}\n\nAccepter ou refuser sous Admin › Data rooms :\n{link}" },
  },
  ext_received: {
    en: { s: "Clavoris: extension request received — {room}", t: "Dear {name},\n\nYour request to extend your access to the data room \"{room}\" until {date} has been received by {company}. You will be notified of the decision by e-mail." },
    nl: { s: "Clavoris: verlengingsaanvraag ontvangen — {room}", t: "Beste {name},\n\nUw aanvraag om uw toegang tot de dataroom \"{room}\" te verlengen tot {date} is ontvangen door {company}. U wordt per e-mail op de hoogte gebracht van de beslissing." },
    fr: { s: "Clavoris : demande de prolongation reçue — {room}", t: "Cher/Chère {name},\n\nVotre demande de prolongation de votre accès à la data room « {room} » jusqu'au {date} a été reçue par {company}. Vous serez informé(e) de la décision par e-mail." },
  },
  ext_accepted: {
    en: { s: "Clavoris: access extended — {room}", t: "Dear {name},\n\n{company} has extended your access to the data room \"{room}\". Your access now runs until {date}.{note}\n\nOpen the data room:\n{link}" },
    nl: { s: "Clavoris: toegang verlengd — {room}", t: "Beste {name},\n\n{company} heeft uw toegang tot de dataroom \"{room}\" verlengd. Uw toegang loopt nu tot {date}.{note}\n\nOpen de dataroom:\n{link}" },
    fr: { s: "Clavoris : accès prolongé — {room}", t: "Cher/Chère {name},\n\n{company} a prolongé votre accès à la data room « {room} ». Votre accès court désormais jusqu'au {date}.{note}\n\nOuvrir la data room :\n{link}" },
  },
  ext_rejected: {
    en: { s: "Clavoris: extension not granted — {room}", t: "Dear {name},\n\n{company} has not granted the extension of your access to the data room \"{room}\" that you requested. Your access ends on {date}.{note}\n\nAfter that date you can still open the data room and download your signed non-disclosure agreement, but no other documents." },
    nl: { s: "Clavoris: verlenging niet toegekend — {room}", t: "Beste {name},\n\n{company} heeft de door u gevraagde verlenging van uw toegang tot de dataroom \"{room}\" niet toegekend. Uw toegang eindigt op {date}.{note}\n\nNa die datum kunt u de dataroom nog openen en uw ondertekende geheimhoudingsovereenkomst downloaden, maar geen andere documenten." },
    fr: { s: "Clavoris : prolongation non accordée — {room}", t: "Cher/Chère {name},\n\n{company} n'a pas accordé la prolongation de votre accès à la data room « {room} » que vous aviez demandée. Votre accès prend fin le {date}.{note}\n\nAprès cette date, vous pourrez encore ouvrir la data room et télécharger votre accord de confidentialité signé, mais aucun autre document." },
  },
  note_line: { en: { s: "", t: "\n\nNote from {company}: {note}" }, nl: { s: "", t: "\n\nOpmerking van {company}: {note}" }, fr: { s: "", t: "\n\nRemarque de {company} : {note}" } },
  access_7d: {
    en: { s: "Clavoris: your access to {room} ends in 7 days", t: "Dear {name},\n\nYour access to the data room \"{room}\" ends on {date}. After that date you can still open the room and download your signed non-disclosure agreement, but no other documents.\n\nIf you need more time, request an extension from inside the data room:\n{link}" },
    nl: { s: "Clavoris: uw toegang tot {room} eindigt over 7 dagen", t: "Beste {name},\n\nUw toegang tot de dataroom \"{room}\" eindigt op {date}. Daarna kunt u de dataroom nog openen en uw ondertekende geheimhoudingsovereenkomst downloaden, maar geen andere documenten.\n\nHebt u meer tijd nodig, vraag dan een verlenging aan vanuit de dataroom:\n{link}" },
    fr: { s: "Clavoris : votre accès à {room} prend fin dans 7 jours", t: "Cher/Chère {name},\n\nVotre accès à la data room « {room} » prend fin le {date}. Après cette date, vous pourrez encore ouvrir la data room et télécharger votre accord de confidentialité signé, mais aucun autre document.\n\nS'il vous faut plus de temps, demandez une prolongation depuis la data room :\n{link}" },
  },
  access_24h: {
    en: { s: "Final notice — your access to {room} ends in 24 hours", t: "Dear {name},\n\nThis is the final notice: your access to the data room \"{room}\" ends on {date}. Downloads will no longer be possible after that moment, except your signed non-disclosure agreement.\n\nRequest an extension now if needed:\n{link}" },
    nl: { s: "Laatste kennisgeving — uw toegang tot {room} eindigt over 24 uur", t: "Beste {name},\n\nDit is de laatste kennisgeving: uw toegang tot de dataroom \"{room}\" eindigt op {date}. Downloads zijn daarna niet meer mogelijk, behalve uw ondertekende geheimhoudingsovereenkomst.\n\nVraag nu een verlenging aan indien nodig:\n{link}" },
    fr: { s: "Dernier avis — votre accès à {room} prend fin dans 24 heures", t: "Cher/Chère {name},\n\nCeci est le dernier avis : votre accès à la data room « {room} » prend fin le {date}. Les téléchargements ne seront plus possibles ensuite, à l'exception de votre accord de confidentialité signé.\n\nDemandez une prolongation maintenant si nécessaire :\n{link}" },
  },
};

const FALLBACK_NAME: Record<Lang, string> = { en: "investor", nl: "belegger", fr: "investisseur" };

// Build a localised mail. `vars.name` falls back to a neutral salutation.
export function mail(lang: Lang, key: string, vars: V = {}): { subject: string; text: string } {
  const e = T[key]?.[lang] || T[key]?.en;
  if (!e) return { subject: key, text: key };
  const v = { ...vars, name: vars.name || FALLBACK_NAME[lang] };
  return { subject: fill(e.s, v), text: fill(e.t, v) };
}
export function word(lang: Lang, key: string, vars: V = {}): string { return fill(T[key]?.[lang]?.t || T[key]?.en?.t || key, vars); }
