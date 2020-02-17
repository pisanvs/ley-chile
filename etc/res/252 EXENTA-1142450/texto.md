APRUEBA "INSTRUCTIVO TÉCNICO PARA LA CONEXIÓN EN LÍNEA CON LOS SISTEMAS DE INFORMACIÓN DE LA SUPERINTENDENCIA DEL MEDIO AMBIENTE"

Núm. 252 exenta.- Santiago, 10 de febrero de 2020.

Vistos:

Lo dispuesto en la ley orgánica de la Superintendencia del Medio Ambiente, fijada en el artículo segundo de la ley N° 20.417, que crea el Ministerio, el Servicio de Evaluación Ambiental y la Superintendencia del Medio Ambiente (Losma); en la ley N° 19.880, que establece las Bases de los Procedimientos Administrativos que rigen los Actos de los Órganos de la Administración del Estado; en el decreto con fuerza de ley N° 1/19.653, de 2001, que fija texto refundido, coordinado y sistematizado de la ley N° 18.575, Orgánica Constitucional de Bases Generales de la Administración del Estado; en la ley N° 19.300, sobre Bases Generales del Medio Ambiente; en la ley N° 18.834, que Aprueba el Estatuto Administrativo; en la resolución exenta N° 424, de 12 de mayo de 2017, de la Superintendencia del Medio Ambiente, que fija la Organización Interna de la Superintendencia del Medio Ambiente; en las resoluciones exentas N° 559, de 14 de mayo de 2018, N° 438, de 28 de marzo de 2019, y N° 1.619, de 21 de noviembre de 2019, que modifican la resolución exenta N° 424, de 2017; en el decreto con fuerza de ley N° 3, de 11 de septiembre de 2010, del Ministerio Secretaría General de la Presidencia, que fija la Planta de Personal de la Superintendencia del Medio Ambiente y su Régimen de Remuneraciones; en la resolución exenta RA N°119123/129/2019, de 6 de septiembre de 2019, de la Superintendencia del Medio Ambiente, que nombra a don Emanuel Ibarra Soto en calidad de titular en el cargo de Fiscal de la Superintendencia del Medio Ambiente, y en la resolución N° 7, de 16 de marzo de 2019, de la Contraloría General de la República, que fija normas sobre exención del trámite de toma de razón.

Considerando:

1. La Superintendencia del Medio Ambiente (SMA) es el servicio público creado para ejecutar, organizar y coordinar el seguimiento y fiscalización de las Resoluciones de Calificación Ambiental, de las medidas de los Planes de Prevención y/o Descontaminación Ambiental, del contenido de las Normas de Calidad Ambiental, y Normas de Emisión, y de los Planes de Manejo, cuando corresponda, y de todos aquellos instrumentos de carácter ambiental que establece la ley, así como imponer sanciones en caso que se constaten infracciones que sean de su competencia.

2. Para dar cumplimiento a lo anterior, dentro de su organización interna la Superintendencia del Medio Ambiente cuenta con el Departamento de Gestión e Información (DGI), cuya principal función es apoyar a las diferentes unidades y procesos de este Servicio, asegurando el continuo y correcto funcionamiento de las plataformas de red y comunicaciones.

3. En este sentido, los distintos instrumentos de carácter ambiental (ICA) y las instrucciones que ha dictado este Servicio en ejercicio de sus atribuciones, generan en sus sujetos obligados el deber de realizar una conexión en línea para la entrega de datos o información específica, en determinadas condiciones, según sea el caso.

4. Para materializar lo anterior, esta Superintendencia estima necesario indicar los requisitos mínimos relacionados con la conexión en línea, que permita reportar en tiempo real los valores de variables medidas en el Sistemas de Monitoreo Continuo de Emisiones (CEMS), instrumentación industrial, estaciones de calidad del aire u otros sistemas distintos a los CEMS, destinados al monitoreo remoto, según lo establecido por el respectivo ICA o la instrucción de carácter general que aplique al efecto que haya dictado la SMA.

5. Para lograr lo anterior, la SMA dictó con fecha 4 de febrero de 2019, la resolución exenta N° 174, que aprueba el "Instructivo técnico para la conexión en línea de sistema de monitoreo de la Superintendencia del Medio Ambiente".

6. Mediante resolución exenta N° 1.574, de 12 de noviembre de 2019, de la SMA se aprobó la "Instrucción General para la Conexión en Línea de los Sistemas de Monitoreo Continuo de Emisiones - CEMS".

7. Mediante resolución exenta N° 126, de 23 de enero de 2020, aprobó la "Instrucción General para la Conexión en Línea y Reportes de Seguimiento de las Estaciones de Vigilancia de la Calidad del Aire que Indica".

8. Considerado las nuevas instrucciones que se han dictado a la fecha y que dicen relación con materias asociadas a la conexión en línea con los sistemas de la SMA, se hace necesario actualizar la resolución exenta N° 174 mencionada en el considerando 5° anterior, por lo cual se procede a resolver lo siguiente:

Resuelvo:

Primero: Apruébase el documento denominado "Instructivo Técnico para la conexión en línea con los sistemas de información de la Superintendencia del Medio Ambiente", cuyo texto a continuación se transcribe:

"INSTRUCTIVO TÉCNICO PARA LA CONEXIÓN EN LÍNEA CON LOS SISTEMAS DE INFORMACIÓN DE LA SUPERINTENDENCIA DEL MEDIO AMBIENTE

### 1. ALCANCE

El siguiente documento tiene como propósito establecer los lineamientos técnicos para todos los titulares que tengan la obligación de establecer una conexión en línea con la SMA. En este contexto, existen dos escenarios de conexión que aborda el siguiente documento. En el apartado 4.1 se especifica la forma de reportar en tiempo real los valores de variables medidas provenientes de Sistemas de Monitoreo Continuo de Emisiones (CEMS), mientras que el apartado 4.2 abarca lo relacionado a conexiones en línea con instrumentación industrial, estaciones de calidad del aire u otros sistemas distintos a CEMS, destinados al monitoreo remoto, según lo establecido por algún Instrumento de Carácter Ambiental (ICA) o alguna instrucción de carácter general emitida por la SMA.

Por lo tanto, se trata de un protocolo general que define los lineamientos técnicos en los que se basa toda comunicación en línea con los sistemas de información de la SMA, incluyendo parámetros y variables operacionales de interés registrados tanto por CEMS, como por otros instrumentos utilizados para el monitoreo ambiental.

Los conceptos y metodologías mencionadas en este documento se basan en estándares del ámbito de las tecnologías de la información, por lo que se recomienda que un profesional del área de la Informática, Electrónica, Telemática o afín sea quien implemente la conexión en línea.

### 2. DEFINICIONES

Para una adecuada comprensión e implementación de este protocolo, se establecen las siguientes definiciones:

. API: Interfaz de programación de aplicaciones (Application Programming Interface).

. CEMS: Sistema de monitoreo continuo de emisiones (Continuous Emissions Monitoring System).

. CPE: Equipo Local de Cliente (Customer Premises Equipment).

. DCS: Sistema de control distribuido (Distributed Control System).

. DNP3: Protocolo industrial de comunicaciones para redes distribuidas versión 3 (Distributed Network Protocol v3).

. Enlace punto a punto: es un medio de comunicación entre 2 redes, sin posibilidad de interferencia con otras variables.

. Firewall: Cortafuegos. Medida de seguridad ocupada en informática para restringir la entrada y salida de datos desde una red privada.

. IP: Protocolo de internet (Internet Protocol).

. MPLS: Conmutación de etiquetas multiprotocolo (Multiprotocol Label Switching). Es un mecanismo de transporte de datos estándar.

. P&ID: Diagrama de cañerías e instrumentación (Piping and instrumentation Diagram).

. PLC: Controlador lógico programable (Programmable Logic Controller).

. REST: Transferencia de estado representacional (Representational State Transfer).

. RTU: Unidad terminal remota (Remote Terminal Unit).

. TCP: Protocolo de control de transmisión (Transmission Control Protocol).

. Unidad Fiscalizable: Unidad Física en la que se desarrollan obras, acciones o procesos, relacionados entre sí y que se encuentran regulados por uno o más instrumentos de carácter ambiental de competencia de la SMA, de acuerdo a lo establecido en la resolución exenta SMA N° 1.184 de 2015.

. UPS: Sistema de alimentación ininterrumpida (Uninterruptible Power Supply).

. VPN: Red privada virtual (Virtual Private Network).

### 3. REQUISITOS GENERALES

Para implementar la conexión en línea con la SMA se establecen los siguientes requisitos generales mínimos, que aplican a cualquier tipo de instrumento (CEMS u otros):

. Conexión a fuente primaria de datos: Los datos reportados en línea deben provenir desde el equipo adquisidor (PLC, RTU, DCS, etc.) más cercano al instrumento de medición que registra el parámetro y/o la variable operacional de interés. A su vez, por defecto, los datos transmitidos deben ser los datos crudos capturados desde la fuente (esto es, sin ningún tipo de procesamiento). De todos modos, para no afectar la estabilidad de las redes internas de los titulares se podrá utilizar un PLC "espejo" u otro equipo similar, en el cual se deben replicar los datos de interés, tanto del CEMS, como de otros equipos (instrumentos industriales), según sea el caso.

. Marca de Tiempo: El dato enviado debe contener estampa de tiempo, la cual debe ser agregada en el instante en que se registra el dato en el equipo adquisidor. En el caso de transmitir más de un dato de forma simultánea, la estampa de tiempo debe ser la misma para todos los datos. Dicha estampa de tiempo debe estar sincronizada al horario oficial de Chile continental de invierno (GTM-4).

. Frecuencia de envío: Los datos deben reportarse las 24 horas del día, con resolución de un minuto. De este modo, si se generan datos en un tiempo menor (segundos) deberán procesarse y reportarse a nivel minutal. Sin embargo, si existe una instrucción específica que indique una resolución de tiempo distinta, contenida en un Instrumento de Carácter Ambiental o en un instructivo de la SMA, será predominante por sobre lo establecido en este párrafo.

### 4. REQUISITOS ESPECÍFICOS POR TIPO DE CONEXIÓN

Se consideran dos tipos de conexión en línea, en función de los sistemas de monitoreo utilizados: (i) Estándar de conexión para CEMS; (ii) Estándar de conexión para otros instrumentos de medición.

4.1 Estándar de conexión para CEMS

4.1.1 Sobre el sistema de gestión, adquisición y reporte de datos El titular deberá presentar una propuesta de conexión en línea a la SMA, con información relevante sobre el sistema de adquisición y procesamiento de los datos relacionadas con el monitoreo en línea, la cual debe ser aprobada por la SMA, antes de su implementación. Como mínimo este informe debe contener:

. Información sobre los equipos que estarán involucrados en la adquisición, procesamiento, transmisión y almacenaje de los datos reportados.

. Filosofía de control y comunicación que utilizará el sistema de monitoreo para la conexión con la SMA, lo que implica explicar la forma general en que funcionará el sistema, los protocolos de comunicación, niveles de alarma, y equipos a utilizar, entre otros.

. Diagrama P&ID (Piping and Instrumentation Diagram) del sistema de monitoreo a implementar por el titular para la conexión con la SMA.

. Diagrama que muestre cuál será la cadena de procesamiento de los datos.

La propuesta de conexión en línea deberá ser presentada por Titular y por cada Unidad Fiscalizable que disponga, de forma independiente.

4.1.2 Conexión en Línea

Para los casos en que se utilice un CEMS, se deberán considerar los siguientes requisitos mínimos para la conexión en línea con la SMA:

. La conexión con los sistemas de la SMA debe ser mediante enlace TCP/IP, vía conexión MPLS dedicada. Cabe destacar que la conexión a nuestro Datacenter debe ser de manera lógica, no siendo necesario conectarse a nuestra infraestructura de manera física. Para esto, la SMA cuenta con proveedores de enlaces MPLS que permiten lograr la comunicación de extremo a extremo.

. El enlace debe contar con VPN y reglas en los firewalls en cada uno de los extremos.

. El protocolo de comunicación a emplear es el DNP3, de forma exclusiva.

. El puerto a utilizar será determinado para cada titular.

. El tráfico de datos de extremo a extremo no debe ser intervenido por ningún servidor. El tráfico solo debe pasar por equipos de comunicación como switches, routers, firewalls o equivalentes, lo cual debe ser acreditado en la propuesta de conexión.

. Un titular podrá concentrar las conexiones provenientes de Unidades Fiscalizables de distintas locaciones en un mismo enlace MPLS, de acuerdo a lo indicado en el punto anterior, es decir, siempre y cuando no haya intervención de servidores.

A continuación, se presentan las arquitecturas permitidas para el enlace MPLS dedicado.

.

Figura 1: Diagrama de conexión Directa

.

Figura 2: Diagrama de conexión con PLC Espejo

.

Figura 3: Diagrama de conexión concentrada (varias locaciones de un mismo titular)

4.2 Estándar de conexión para otros instrumentos de medición Para los casos en que se utilice un instrumento de medición distinto a un CEMS, para el monitoreo de parámetros y variables operacionales de interés, el titular deberá establecer la conexión en línea con la SMA cumpliendo los siguientes lineamientos técnicos:

. El titular debe concentrar en un PLC, RTU, Workstation o el dispositivo que estime conveniente, la información proveniente desde los instrumentos de medición o sistemas encargados del monitoreo de variables operacionales de interés, según lo establecido en los Instrumentos de Carácter Ambiental o Instrucciones de la SMA que correspondan.

.La SMA dispondrá de un servicio API REST para establecer la conexión en línea, donde el titular deberá reportar los datos en tiempo real con la resolución que corresponda. En estos casos, no será necesario presentar una propuesta para la conexión en línea, sino que solo registrarse en el formulario electrónico que la SMA disponga para estos fines y seguir las instrucciones correspondientes.

. La SMA establecerá el formato de reporte de los datos, a través de la documentación del servicio API REST.

. El titular debe entregar toda la información relevante sobre el sistema de adquisición, concentración, almacenaje y transmisión de datos, a través de los medios que disponga la SMA para esto fines, pudiendo solicitar información adicional, si así lo estima conveniente.

. El titular debe informar sobre las operaciones y periodicidad de las rutinas de calibración relacionado con los instrumentos de medición involucrados, de acuerdo a las instrucciones específicas que se dicten para el efecto.

. Cualquier eventualidad no abarcada en este instructivo que dificulte la conexión en línea de datos en tiempo real deberá ser informada por el titular, para su análisis por parte de la SMA, justificando debidamente el porqué del impedimento. La solución a esta eventualidad debe ser aprobada por la SMA.

.

Figura 4: Esquema Simplificado de conexión en línea para titulares sin CEMS

4.3 Sobre la disponibilidad de los datos históricos

En todos los casos (CEMS u otros instrumentos), para asegurar la disponibilidad de los datos históricos de las mediciones registradas, el titular deberá disponer de un servicio API REST, al cual se podrá realizar una consulta bajo demanda de los datos históricos de telemetría, en caso de fallas y/o necesidad de contrastar información. Para ello, se deberá mantener información histórica de al menos los últimos 18 meses. La SMA establecerá tanto la forma de organización de los recursos y puntos de conexión de la API, como el formato de representación de datos en el que se debe retornar la información solicitada. Sin perjuicio de lo anterior, el titular deberá mantener información histórica de los últimos 3 años, en los medios que estime conveniente, de acuerdo a la normativa vigente.

La siguiente figura muestra un diagrama de componentes de lo solicitado.

.

Figura 5: Esquema servidor WEB

### 5. OTRAS CONSIDERACIONES

Adicionalmente, se deberá tener en consideración los siguientes elementos:

. El titular debe asegurar el soporte de energía eléctrica a los equipos involucrados en la adquisición y envío de datos de telemetría por parte del titular con la SMA, a través de UPS u otro sistema que garantice la disponibilidad de los datos para cualquier escenario de conexión en línea (CEMS u otros).

. El titular deberá implementar todos los resguardos necesarios, con respecto a la seguridad de sus sistemas, incluyendo enlaces y equipos, para evitar hackeos, interrupciones por cortes eléctricos, denegación del servicio, manipulación mal intencionada del CEMS y del enlace con el sistema de la SMA, entre otros.

. La información a reportar corresponderá a la solicitada por la normativa vigente para cada caso. No obstante, la SMA podrá solicitar la inclusión de información adicional a reportar, a través de la conexión establecida, con objeto de validar y caracterizar los datos, entre otros aspectos. En caso de que así sea, se informará oportunamente al titular, la información y requisitos técnicos a cumplir.

. Los parámetros y variables operacionales a transmitir por medio de la conexión en línea serán determinadas por la SMA de acuerdo al Instrumento de Carácter Ambiental que corresponda, así como lo establecido en instrucciones específicas entregadas por la SMA.

. El dato crudo reportado debe estar acompañado de una determinada caracterización, a través de los formatos que la SMA defina para ello.

### 6. ASEGURAMIENTO Y CONTROL DE CALIDAD

. Se considerarán auditorías técnicas que certifiquen los sistemas utilizados y/o la información entregada por los titulares.

. En los casos que se presenten periodos fuera de control en los CEMS o en Instrumentos de medición, se deberá dar cumplimiento a las instrucciones establecidas por la SMA que correspondan.

. Solo para el caso en que se presente una falla en la conexión entre un sistema de monitoreo y la SMA, el titular deberá notificar la situación al correo snifa@sma.gob.cl, en un plazo máximo de 12 horas, indicando la falla generada, el tiempo que tomará su corrección, y las medidas asociadas para evitar que la falla ocurra nuevamente. Durante el período sin transmisión de datos, el titular deberá almacenar los datos, según lo instruido en este documento.

### 7. PASOS ADMINISTRATIVOS

. En el caso de conexiones a equipos CEMS, para iniciar el proceso, el titular deberá presentar una propuesta de conexión mediante carta ingresada en la oficina de partes del nivel central de la SMA o a través de los medios digitales que la SMA indique. En ella deben incluirse los plazos (carta Gantt), además de las condiciones técnicas e hitos que permitan dar cumplimiento a los requerimientos presentados en este documento.

. En el caso de conexiones a instrumentos de medición que no sean CEMS, el titular deberá seguir las instrucciones fijadas en la documentación asociada al servicio API REST que la SMA dispondrá para establecer la conexión en línea. No será necesario presentar una propuesta, sino que solo registrarse en el formulario electrónico que la SMA disponga para estos fines y seguir las instrucciones correspondientes.

. Las fuentes que deban implementar una conexión en línea con la SMA deberán realizarla según los plazos establecidos en los instrumentos de carácter ambiental correspondientes y/o de acuerdo a instrucciones específicas entregadas por la SMA.

. Una vez que la conexión en línea se encuentre operando, todo cambio que se requiera implementar en el sistema deberá ser previamente notificado a la SMA, al menos 15 días hábiles antes de su eventual implementación. De este modo, cualquier cambio deberá ser validado por la SMA antes de su implementación, para asegurar el cumplimiento de este protocolo.

Ante dudas y/o consultas al respecto, el titular podrá contactarse a la SMA a través de los canales de comunicación oficiales establecidos, en particular, el correo snifa@sma.gob.cl."

Segundo: Públíquese la presente resolución en el Diario Oficial, quedando disponible el documento que aprueba la misma en la página web: http://snifa.sma.gob.cl.

Tercero: Déjese sin efecto la resolución exenta N° 174, de fecha 4 de febrero de 2019, que aprueba el "Instructivo técnico para la conexión en línea de sistema de monitoreo de la Superintendencia del Medio Ambiente".

Cuarto: Vigencia. La presente resolución entrará en vigencia en la fecha de su publicación en el Diario Oficial.

Anótese, comuníquese, publíquese en el Diario Oficial, dése cumplimiento y archívese.- Emanuel Ibarra Soto, Superintendente del Medio Ambiente (S).