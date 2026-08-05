/* ============================================================
   CLAVORIS — footer + legal-page strings (all 10 languages)
   Layered onto the base dictionaries via Object.assign.
   ============================================================ */
(function () {
  var L = window.I18N;
  function add(lang, obj) { if (L[lang]) Object.assign(L[lang], obj); }

  add("en", {
    foot_legal_h: "Legal", foot_privacy: "Privacy Policy", foot_terms: "General Terms",
    foot_loc_h: "Locations", foot_loc: "Luxembourg · London · New York",
    foot_rights: "© 2026 Van Beirs Holding B.V. All rights reserved.",
    legal_contact_h: "Contact", legal_contact: "For any privacy or legal request, contact",
    pv_eyebrow: "Privacy", pv_title: "Privacy Policy",
    pv_lede: "How Clavoris and Clavoris BV in formation process the personal data of professional investors and visitors.",
    pv_updated: "Last updated · April 2026",
    pv_h1: "Data controller", pv_b1: "Clavoris is operated by Clavoris BV in formation, <a class='vbv' href='https://www.vanbeirsventures.com' target='_blank' rel='noopener'>Van Beirs Ventures</a>. Clavoris BV in formation acts as data controller for personal data processed through the platform.",
    pv_h2: "Data we process", pv_b2: "Identity and KYC data collected under AMLD6, professional-investor categorisation under MiFID II, and the technical logs required to operate the platform securely.",
    pv_h3: "Purpose, legal basis and your rights", pv_b3: "Personal data is processed solely to verify eligibility, meet regulatory obligations and operate the platform — never for advertising. Under the GDPR you may access, rectify or erase your data.",
    tm_eyebrow: "Terms", tm_title: "General Terms",
    tm_lede: "The terms governing access to and use of the Clavoris platform.",
    tm_updated: "Last updated · April 2026",
    tm_h1: "Eligibility", tm_b1: "Access is restricted to professional investors under MiFID II, subject to AMLD6 KYC verification. The minimum subscription is €100,000.",
    tm_h2: "No offer or advice", tm_b2: "This platform is informational and does not constitute an offer, solicitation, recommendation or investment advice. Instruments are issued by partner issuers, each solely responsible for its own instruments and offering documentation. Private capital instruments carry risk, including loss of capital; Clavoris makes no promise of return or yield.",
    tm_h3: "Governing law", tm_b3: "These terms are governed by the laws of Luxembourg. The competent courts of Luxembourg have exclusive jurisdiction over any dispute."
  });

  add("nl", {
    foot_legal_h: "Juridisch", foot_privacy: "Privacybeleid", foot_terms: "Algemene voorwaarden",
    foot_loc_h: "Locaties", foot_loc: "Luxemburg · Londen · New York",
    foot_rights: "© 2026 Van Beirs Holding B.V. Alle rechten voorbehouden.",
    legal_contact_h: "Contact", legal_contact: "Voor elke privacy- of juridische aanvraag, neem contact op met",
    pv_eyebrow: "Privacy", pv_title: "Privacybeleid",
    pv_lede: "Hoe Clavoris en Clavoris BV in oprichting de persoonsgegevens van professionele beleggers en bezoekers verwerken.",
    pv_updated: "Laatst bijgewerkt · april 2026",
    pv_h1: "Verwerkingsverantwoordelijke", pv_b1: "Clavoris wordt beheerd door Clavoris BV in oprichting, <a class='vbv' href='https://www.vanbeirsventures.com' target='_blank' rel='noopener'>Van Beirs Ventures</a>. Clavoris BV in oprichting treedt op als verwerkingsverantwoordelijke voor de via het platform verwerkte persoonsgegevens.",
    pv_h2: "Gegevens die we verwerken", pv_b2: "Identiteits- en KYC-gegevens verzameld onder AMLD6, beleggerscategorisatie onder MiFID II, en de technische logs die nodig zijn om het platform veilig te bedienen.",
    pv_h3: "Doel, rechtsgrond en uw rechten", pv_b3: "Persoonsgegevens worden uitsluitend verwerkt om de geschiktheid te verifiëren, aan wettelijke verplichtingen te voldoen en het platform te bedienen — nooit voor reclame. Onder de AVG kunt u uw gegevens inzien, corrigeren of wissen.",
    tm_eyebrow: "Voorwaarden", tm_title: "Algemene voorwaarden",
    tm_lede: "De voorwaarden die de toegang tot en het gebruik van het Clavoris-platform regelen.",
    tm_updated: "Laatst bijgewerkt · april 2026",
    tm_h1: "Toelaatbaarheid", tm_b1: "Toegang is beperkt tot professionele beleggers onder MiFID II, na AMLD6-KYC-verificatie. De minimale inschrijving bedraagt € 100.000.",
    tm_h2: "Geen aanbod of advies", tm_b2: "Dit platform is informatief en vormt geen aanbod, uitnodiging, aanbeveling of beleggingsadvies. Instrumenten worden uitgegeven door partneruitgevers, die elk als enige verantwoordelijk zijn voor hun eigen instrumenten en aanbiedingsdocumentatie. Private kapitaalinstrumenten houden risico in, waaronder kapitaalverlies; Clavoris doet geen enkele belofte over rendement.",
    tm_h3: "Toepasselijk recht", tm_b3: "Op deze voorwaarden is het recht van Luxemburg van toepassing. De bevoegde rechtbanken van Luxemburg hebben exclusieve jurisdictie over elk geschil."
  });

  add("de", {
    foot_legal_h: "Rechtliches", foot_privacy: "Datenschutz", foot_terms: "Allgemeine Bedingungen",
    foot_loc_h: "Standorte", foot_loc: "Luxemburg · London · New York",
    foot_rights: "© 2026 Van Beirs Holding B.V. Alle Rechte vorbehalten.",
    legal_contact_h: "Kontakt", legal_contact: "Für Datenschutz- oder Rechtsanfragen kontaktieren Sie",
    pv_eyebrow: "Datenschutz", pv_title: "Datenschutzerklärung",
    pv_lede: "Wie Clavoris und Clavoris BV in Gründung die personenbezogenen Daten professioneller Anleger und Besucher verarbeiten.",
    pv_updated: "Zuletzt aktualisiert · April 2026",
    pv_h1: "Verantwortlicher", pv_b1: "Clavoris wird von Clavoris BV in Gründung, <a class='vbv' href='https://www.vanbeirsventures.com' target='_blank' rel='noopener'>Van Beirs Ventures</a> betrieben. Clavoris BV in Gründung ist Verantwortlicher für die über die Plattform verarbeiteten personenbezogenen Daten.",
    pv_h2: "Verarbeitete Daten", pv_b2: "Identitäts- und KYC-Daten, erhoben gemäß AMLD6, Anlegerkategorisierung gemäß MiFID II sowie die für den sicheren Betrieb erforderlichen technischen Protokolle.",
    pv_h3: "Zweck, Rechtsgrundlage und Ihre Rechte", pv_b3: "Personenbezogene Daten werden ausschließlich zur Eignungsprüfung, zur Erfüllung gesetzlicher Pflichten und zum Betrieb der Plattform verarbeitet — niemals zu Werbezwecken. Nach der DSGVO können Sie Ihre Daten einsehen, berichtigen oder löschen.",
    tm_eyebrow: "Bedingungen", tm_title: "Allgemeine Bedingungen",
    tm_lede: "Die Bedingungen für den Zugang zur und die Nutzung der Clavoris-Plattform.",
    tm_updated: "Zuletzt aktualisiert · April 2026",
    tm_h1: "Zugangsberechtigung", tm_b1: "Der Zugang ist auf professionelle Anleger gemäß MiFID II beschränkt, vorbehaltlich der AMLD6-KYC-Verifizierung. Die Mindestzeichnung beträgt 100.000 €.",
    tm_h2: "Kein Angebot, keine Beratung", tm_b2: "Diese Plattform dient der Information und stellt kein Angebot, keine Aufforderung, keine Empfehlung und keine Anlageberatung dar. Die Instrumente werden von Partner-Emittenten begeben, die jeweils allein für ihre eigenen Instrumente und Angebotsunterlagen verantwortlich sind. Private Kapitalinstrumente sind mit Risiken verbunden, einschließlich des Kapitalverlusts; Clavoris macht keine Zusagen zu Rendite oder Ertrag.",
    tm_h3: "Anwendbares Recht", tm_b3: "Diese Bedingungen unterliegen dem Recht Luxemburgs. Die zuständigen Gerichte Luxemburgs sind für jeden Streitfall ausschließlich zuständig."
  });

  add("fr", {
    foot_legal_h: "Mentions légales", foot_privacy: "Politique de confidentialité", foot_terms: "Conditions générales",
    foot_loc_h: "Implantations", foot_loc: "Luxembourg · Londres · New York",
    foot_rights: "© 2026 Van Beirs Holding B.V. Tous droits réservés.",
    legal_contact_h: "Contact", legal_contact: "Pour toute demande relative à la confidentialité ou au droit, contactez",
    pv_eyebrow: "Confidentialité", pv_title: "Politique de confidentialité",
    pv_lede: "Comment Clavoris et Clavoris BV en cours de constitution traitent les données personnelles des investisseurs professionnels et des visiteurs.",
    pv_updated: "Dernière mise à jour · avril 2026",
    pv_h1: "Responsable du traitement", pv_b1: "Clavoris est exploitée par Clavoris BV en cours de constitution, <a class='vbv' href='https://www.vanbeirsventures.com' target='_blank' rel='noopener'>Van Beirs Ventures</a>. Clavoris BV en cours de constitution agit en tant que responsable du traitement des données personnelles traitées via la plateforme.",
    pv_h2: "Données traitées", pv_b2: "Données d'identité et KYC collectées au titre de l'AMLD6, catégorisation des investisseurs au titre de MiFID II, et les journaux techniques nécessaires au fonctionnement sécurisé de la plateforme.",
    pv_h3: "Finalité, base légale et vos droits", pv_b3: "Les données personnelles sont traitées uniquement pour vérifier l'éligibilité, satisfaire aux obligations réglementaires et exploiter la plateforme — jamais à des fins publicitaires. En vertu du RGPD, vous pouvez accéder à vos données, les rectifier ou les effacer.",
    tm_eyebrow: "Conditions", tm_title: "Conditions générales",
    tm_lede: "Les conditions régissant l'accès à la plateforme Clavoris et son utilisation.",
    tm_updated: "Dernière mise à jour · avril 2026",
    tm_h1: "Éligibilité", tm_b1: "L'accès est réservé aux investisseurs professionnels au sens de MiFID II, sous réserve de la vérification KYC AMLD6. La souscription minimale est de 100 000 €.",
    tm_h2: "Ni offre ni conseil", tm_b2: "Cette plateforme est informative et ne constitue ni une offre, ni une sollicitation, ni une recommandation, ni un conseil en investissement. Les instruments sont émis par des émetteurs partenaires, chacun étant seul responsable de ses propres instruments et de sa documentation d'offre. Les instruments de capital privé comportent des risques, y compris la perte du capital ; Clavoris ne promet aucun rendement.",
    tm_h3: "Droit applicable", tm_b3: "Ces conditions sont régies par le droit luxembourgeois. Les tribunaux compétents du Luxembourg ont compétence exclusive sur tout litige."
  });

  add("es", {
    foot_legal_h: "Legal", foot_privacy: "Política de privacidad", foot_terms: "Condiciones generales",
    foot_loc_h: "Ubicaciones", foot_loc: "Luxemburgo · Londres · Nueva York",
    foot_rights: "© 2026 Van Beirs Holding B.V. Todos los derechos reservados.",
    legal_contact_h: "Contacto", legal_contact: "Para cualquier solicitud de privacidad o legal, contacte con",
    pv_eyebrow: "Privacidad", pv_title: "Política de privacidad",
    pv_lede: "Cómo Clavoris e Clavoris BV en constitución tratan los datos personales de los inversores profesionales y los visitantes.",
    pv_updated: "Última actualización · abril de 2026",
    pv_h1: "Responsable del tratamiento", pv_b1: "Clavoris está operada por Clavoris BV en constitución, <a class='vbv' href='https://www.vanbeirsventures.com' target='_blank' rel='noopener'>Van Beirs Ventures</a>. Clavoris BV en constitución actúa como responsable del tratamiento de los datos personales procesados a través de la plataforma.",
    pv_h2: "Datos que tratamos", pv_b2: "Datos de identidad y KYC recogidos conforme a AMLD6, categorización de inversores conforme a MiFID II, y los registros técnicos necesarios para operar la plataforma de forma segura.",
    pv_h3: "Finalidad, base legal y sus derechos", pv_b3: "Los datos personales se tratan únicamente para verificar la elegibilidad, cumplir obligaciones regulatorias y operar la plataforma — nunca con fines publicitarios. En virtud del RGPD, puede acceder a sus datos, rectificarlos o suprimirlos.",
    tm_eyebrow: "Condiciones", tm_title: "Condiciones generales",
    tm_lede: "Las condiciones que rigen el acceso a la plataforma Clavoris y su uso.",
    tm_updated: "Última actualización · abril de 2026",
    tm_h1: "Elegibilidad", tm_b1: "El acceso está restringido a inversores profesionales conforme a MiFID II, sujeto a la verificación KYC AMLD6. La suscripción mínima es de 100.000 €.",
    tm_h2: "Sin oferta ni asesoramiento", tm_b2: "Esta plataforma es informativa y no constituye oferta, solicitud, recomendación ni asesoramiento de inversión. Los instrumentos son emitidos por emisores asociados, cada uno único responsable de sus propios instrumentos y documentación de oferta. Los instrumentos de capital privado conllevan riesgo, incluida la pérdida de capital; Clavoris no promete rentabilidad alguna.",
    tm_h3: "Ley aplicable", tm_b3: "Estas condiciones se rigen por las leyes de Luxemburgo. Los tribunales competentes de Luxemburgo tienen jurisdicción exclusiva sobre cualquier disputa."
  });

  add("ca", {
    foot_legal_h: "Legal", foot_privacy: "Política de privacitat", foot_terms: "Condicions generals",
    foot_loc_h: "Ubicacions", foot_loc: "Luxemburg · Londres · Nova York",
    foot_rights: "© 2026 Van Beirs Holding B.V. Tots els drets reservats.",
    legal_contact_h: "Contacte", legal_contact: "Per a qualsevol sol·licitud de privacitat o legal, contacteu amb",
    pv_eyebrow: "Privacitat", pv_title: "Política de privacitat",
    pv_lede: "Com Clavoris BV en constitució tracta les dades personals dels inversors professionals i els visitants.",
    pv_updated: "Última actualització · abril de 2026",
    pv_h1: "Responsable del tractament", pv_b1: "Clavoris és operada per Clavoris BV en constitució, <a class='vbv' href='https://www.vanbeirsventures.com' target='_blank' rel='noopener'>Van Beirs Ventures</a>. Clavoris BV en constitució actua com a responsable del tractament de les dades personals processades a través de la plataforma.",
    pv_h2: "Dades que tractem", pv_b2: "Dades d'identitat i KYC recollides conforme a l'AMLD6, categorització d'inversors conforme a MiFID II, i els registres tècnics necessaris per operar la plataforma de manera segura.",
    pv_h3: "Finalitat, base legal i els vostres drets", pv_b3: "Les dades personals es tracten únicament per verificar l'elegibilitat, complir obligacions regulatòries i operar la plataforma — mai amb finalitats publicitàries. En virtut del RGPD, podeu accedir a les vostres dades, rectificar-les o suprimir-les.",
    tm_eyebrow: "Condicions", tm_title: "Condicions generals",
    tm_lede: "Les condicions que regeixen l'accés a la plataforma Clavoris i el seu ús.",
    tm_updated: "Última actualització · abril de 2026",
    tm_h1: "Elegibilitat", tm_b1: "L'accés està restringit a inversors professionals conforme a MiFID II, subjecte a la verificació KYC AMLD6. La subscripció mínima és de 100.000 €.",
    tm_h2: "Sense oferta ni assessorament", tm_b2: "Aquesta plataforma és informativa i no constitueix oferta, sol·licitud, recomanació ni assessorament d'inversió. Els instruments són emesos per emissors associats, cadascun únic responsable dels seus propis instruments i documentació d'oferta. Els instruments de capital privat comporten risc, inclosa la pèrdua de capital; Clavoris no promet cap rendiment.",
    tm_h3: "Llei aplicable", tm_b3: "Aquestes condicions es regeixen per les lleis de Luxemburg. Els tribunals competents de Luxemburg tenen jurisdicció exclusiva sobre qualsevol disputa."
  });

  add("it", {
    foot_legal_h: "Note legali", foot_privacy: "Informativa sulla privacy", foot_terms: "Condizioni generali",
    foot_loc_h: "Sedi", foot_loc: "Lussemburgo · Londra · New York",
    foot_rights: "© 2026 Van Beirs Holding B.V. Tutti i diritti riservati.",
    legal_contact_h: "Contatto", legal_contact: "Per qualsiasi richiesta sulla privacy o di natura legale, contatta",
    pv_eyebrow: "Privacy", pv_title: "Informativa sulla privacy",
    pv_lede: "Come Clavoris BV in costituzione tratta i dati personali degli investitori professionali e dei visitatori.",
    pv_updated: "Ultimo aggiornamento · aprile 2026",
    pv_h1: "Titolare del trattamento", pv_b1: "Clavoris è gestita da Clavoris BV in costituzione, <a class='vbv' href='https://www.vanbeirsventures.com' target='_blank' rel='noopener'>Van Beirs Ventures</a>. Clavoris BV in costituzione agisce come titolare del trattamento dei dati personali trattati tramite la piattaforma.",
    pv_h2: "Dati che trattiamo", pv_b2: "Dati di identità e KYC raccolti ai sensi dell'AMLD6, categorizzazione degli investitori ai sensi della MiFID II, e i log tecnici necessari a operare la piattaforma in sicurezza.",
    pv_h3: "Finalità, base giuridica e i tuoi diritti", pv_b3: "I dati personali sono trattati esclusivamente per verificare l'idoneità, adempiere agli obblighi normativi e gestire la piattaforma — mai per finalità pubblicitarie. Ai sensi del GDPR puoi accedere, rettificare o cancellare i tuoi dati.",
    tm_eyebrow: "Condizioni", tm_title: "Condizioni generali",
    tm_lede: "Le condizioni che regolano l'accesso alla piattaforma Clavoris e il suo utilizzo.",
    tm_updated: "Ultimo aggiornamento · aprile 2026",
    tm_h1: "Idoneità", tm_b1: "L'accesso è riservato agli investitori professionali ai sensi della MiFID II, previa verifica KYC AMLD6. La sottoscrizione minima è di 100.000 €.",
    tm_h2: "Nessuna offerta né consulenza", tm_b2: "Questa piattaforma è informativa e non costituisce offerta, sollecitazione, raccomandazione o consulenza in materia di investimenti. Gli strumenti sono emessi da emittenti partner, ciascuno unico responsabile dei propri strumenti e della documentazione d'offerta. Gli strumenti di capitale privato comportano rischi, inclusa la perdita del capitale; Clavoris non promette alcun rendimento.",
    tm_h3: "Legge applicabile", tm_b3: "Le presenti condizioni sono regolate dalla legge lussemburghese. I tribunali competenti del Lussemburgo hanno giurisdizione esclusiva su ogni controversia."
  });

  add("pt", {
    foot_legal_h: "Legal", foot_privacy: "Política de privacidade", foot_terms: "Condições gerais",
    foot_loc_h: "Localizações", foot_loc: "Luxemburgo · Londres · Nova Iorque",
    foot_rights: "© 2026 Van Beirs Holding B.V. Todos os direitos reservados.",
    legal_contact_h: "Contacto", legal_contact: "Para qualquer pedido de privacidade ou legal, contacte",
    pv_eyebrow: "Privacidade", pv_title: "Política de privacidade",
    pv_lede: "Como a Clavoris BV em constituição trata os dados pessoais dos investidores profissionais e dos visitantes.",
    pv_updated: "Última atualização · abril de 2026",
    pv_h1: "Responsável pelo tratamento", pv_b1: "A Clavoris é operada pela Clavoris BV em constituição, <a class='vbv' href='https://www.vanbeirsventures.com' target='_blank' rel='noopener'>Van Beirs Ventures</a>. A Clavoris BV em constituição atua como responsável pelo tratamento dos dados pessoais processados através da plataforma.",
    pv_h2: "Dados que tratamos", pv_b2: "Dados de identidade e KYC recolhidos ao abrigo da AMLD6, categorização de investidores ao abrigo da MiFID II, e os registos técnicos necessários para operar a plataforma com segurança.",
    pv_h3: "Finalidade, base legal e os seus direitos", pv_b3: "Os dados pessoais são tratados exclusivamente para verificar a elegibilidade, cumprir obrigações regulamentares e operar a plataforma — nunca para publicidade. Ao abrigo do RGPD, pode aceder aos seus dados, retificá-los ou apagá-los.",
    tm_eyebrow: "Condições", tm_title: "Condições gerais",
    tm_lede: "As condições que regem o acesso à plataforma Clavoris e a sua utilização.",
    tm_updated: "Última atualização · abril de 2026",
    tm_h1: "Elegibilidade", tm_b1: "O acesso está restrito a investidores profissionais ao abrigo da MiFID II, sujeito à verificação KYC AMLD6. A subscrição mínima é de 100 000 €.",
    tm_h2: "Sem oferta nem aconselhamento", tm_b2: "Esta plataforma é informativa e não constitui oferta, solicitação, recomendação ou consultoria para investimento. Os instrumentos são emitidos por emitentes parceiros, cada um único responsável pelos seus próprios instrumentos e documentação de oferta. Os instrumentos de capital privado comportam risco, incluindo a perda de capital; a Clavoris não promete qualquer rendimento.",
    tm_h3: "Lei aplicável", tm_b3: "Estas condições são regidas pelas leis do Luxemburgo. Os tribunais competentes do Luxemburgo têm jurisdição exclusiva sobre qualquer litígio."
  });

  add("ja", {
    foot_legal_h: "法務", foot_privacy: "プライバシーポリシー", foot_terms: "一般利用規約",
    foot_loc_h: "拠点", foot_loc: "ルクセンブルク · ロンドン · ニューヨーク",
    foot_rights: "© 2026 Van Beirs Holding B.V. 無断複写・転載を禁じます。",
    legal_contact_h: "お問い合わせ", legal_contact: "プライバシーまたは法務に関するお問い合わせは次までご連絡ください",
    pv_eyebrow: "プライバシー", pv_title: "プライバシーポリシー",
    pv_lede: "Clavoris BV 設立準備中が、プロフェッショナル投資家および訪問者の個人データをどのように取り扱うか。",
    pv_updated: "最終更新 · 2026年4月",
    pv_h1: "データ管理者", pv_b1: "Clavorisは、Clavoris BV 設立準備中・<a class='vbv' href='https://www.vanbeirsventures.com' target='_blank' rel='noopener'>Van Beirs Ventures</a>が運営します。Clavoris BV 設立準備中は、プラットフォームを通じて処理される個人データの管理者として行動します。",
    pv_h2: "取り扱うデータ", pv_b2: "AMLD6に基づき収集される本人確認・KYCデータ、MiFID IIに基づく投資家分類、およびプラットフォームを安全に運用するために必要な技術ログ。",
    pv_h3: "目的、法的根拠、お客様の権利", pv_b3: "個人データは、適格性の確認、規制上の義務の遵守、プラットフォームの運用のためにのみ処理され、広告には一切使用されません。GDPRに基づき、お客様はご自身のデータへのアクセス、訂正、消去を行えます。",
    tm_eyebrow: "規約", tm_title: "一般利用規約",
    tm_lede: "Clavorisプラットフォームへのアクセスおよび利用を規定する規約。",
    tm_updated: "最終更新 · 2026年4月",
    tm_h1: "対象資格", tm_b1: "アクセスはMiFID IIに基づくプロフェッショナル投資家に限定され、AMLD6のKYC認証が条件となります。最低申込額は10万ユーロです。",
    tm_h2: "勧誘・助言ではありません", tm_b2: "本プラットフォームは情報提供を目的とし、勧誘、推奨または投資助言を構成するものではありません。商品はパートナー発行体が発行し、各発行体は自らの商品および募集書類について単独で責任を負います。プライベート資本商品には元本毀損を含むリスクがあり、Clavorisは収益を一切約束しません。",
    tm_h3: "準拠法", tm_b3: "本規約はルクセンブルク法に準拠します。あらゆる紛争については、ルクセンブルクの管轄裁判所が専属的管轄権を有します。"
  });

  add("zh", {
    foot_legal_h: "法律", foot_privacy: "隐私政策", foot_terms: "一般条款",
    foot_loc_h: "办公地点", foot_loc: "卢森堡 · 伦敦 · 纽约",
    foot_rights: "© 2026 Van Beirs Holding B.V. 版权所有。",
    legal_contact_h: "联系", legal_contact: "如有任何隐私或法律方面的请求,请联系",
    pv_eyebrow: "隐私", pv_title: "隐私政策",
    pv_lede: "Clavoris BV 筹备中 如何处理专业投资者及访问者的个人数据。",
    pv_updated: "最后更新 · 2026 年 4 月",
    pv_h1: "数据控制者", pv_b1: "Clavoris 由 Clavoris BV 筹备中・<a class='vbv' href='https://www.vanbeirsventures.com' target='_blank' rel='noopener'>Van Beirs Ventures</a>运营。Clavoris BV 筹备中 作为通过平台处理之个人数据的数据控制者。",
    pv_h2: "我们处理的数据", pv_b2: "依据 AMLD6 收集的身份与 KYC 数据、依据 MiFID II 的投资者分类,以及安全运营平台所需的技术日志。",
    pv_h3: "目的、法律依据与您的权利", pv_b3: "个人数据仅用于核实资格、履行监管义务及运营平台——绝不用于广告。根据 GDPR,您可以访问、更正或删除您的数据。",
    tm_eyebrow: "条款", tm_title: "一般条款",
    tm_lede: "规范 Clavoris 平台访问与使用的条款。",
    tm_updated: "最后更新 · 2026 年 4 月",
    tm_h1: "准入资格", tm_b1: "访问仅限于 MiFID II 下的专业投资者,并须通过 AMLD6 的 KYC 验证。最低认购额为 100,000 欧元。",
    tm_h2: "非要约或建议", tm_b2: "本平台仅供参考，不构成要约、招揽、推荐或投资建议。金融工具由合作发行人发行，各发行人对其自身的金融工具及发行文件单独负责。私募资本工具存在风险，包括本金损失；Clavoris 不作任何收益承诺。",
    tm_h3: "适用法律", tm_b3: "本条款受卢森堡法律管辖。卢森堡的主管法院对任何争议拥有专属管辖权。"
  });
})();
