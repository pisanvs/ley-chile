APRUEBA "MANUAL API REST - SMA. VERSIÓN 1.0 - FEBRERO 2020"

Núm. 254 exenta.- Santiago, 10 de febrero de 2020.

Vistos:

Lo dispuesto en la ley orgánica de la Superintendencia del Medio Ambiente, fijada en el artículo segundo de la ley Nº 20.417, que crea el Ministerio, el Servicio de Evaluación Ambiental y la Superintendencia del Medio Ambiente (LOSMA); en la Ley Nº 19.880, que establece las Bases de los Procedimientos Administrativos que rigen los Actos de los Órganos de la Administración del Estado; en el decreto con fuerza de ley Nº 1/19.653, de 2001, que fija texto refundido, coordinado y sistematizado de la ley Nº 18.575, Orgánica Constitucional de Bases Generales de la Administración del Estado; en la Ley Nº 19.300, sobre Bases Generales del Medio Ambiente; en la ley Nº 18.834, que Aprueba el Estatuto Administrativo; en la resolución exenta Nº 424, de 12 de mayo de 2017, de la Superintendencia del Medio Ambiente, que fija la Organización Interna de la Superintendencia del Medio Ambiente; en las resoluciones exentas Nº 559, de 14 de mayo de 2018, Nº 438, de 28 de marzo de 2019, y Nº 1.619, de 21 de noviembre de 2019, que modifican la resolución exenta Nº 424, de 2017; en el decreto con fuerza de ley Nº 3, de 11 de septiembre de 2010, del Ministerio Secretaría Generalde la Presidencia, que fija la Planta de Personal de la Superintendencia del Medio Ambiente y su Régimen de Remuneraciones; en la resolución exenta RA Nº119123/129/2019, de 6 de septiembre de 2019, de la Superintendencia del Medio Ambiente, que nombra a don Emanuel Ibarra Soto en calidad de titular en el cargo de Fiscal de la Superintendencia del Medio Ambiente; y, en la resolución Nº 7, de 16 de marzo de 2019, de la Contraloría General de la República, que Fija Normas Sobre Exención del Trámite de Toma de Razón.

Considerando:

1. El artículo segundo de la LOSMA dispone que la Superintendencia del Medio Ambiente (SMA), fue creada con el objeto ejecutar, organizar y coordinar el seguimiento y fiscalización de las Resoluciones de Calificación Ambiental, de las medidas de los Planes de Prevención y, o de Descontaminación Ambiental, del contenido de las Normas de Calidad Ambiental y Normas de Emisión, y de los Planes de Manejo, cuando corresponda, y de todos aquellos otros instrumentos de carácter ambiental que establezca la ley; así como imponer sanciones en caso que se constaten infracciones de su competencia.

2. En virtud de sus facultades legales, la SMA mediante resolución exenta Nº 126, de 23 de enero de 2020, aprobó la "Instrucción General para la Conexión en Línea y Reportes de Seguimiento de las Estaciones de Vigilancia de la Calidad del Aire que Indica".

3. En dicha instrucción, en relación a la forma de realizar la conexión en línea se indicó que "la SMA dispondrá de una API que permitirá la comunicación con la SMA, incluyendo tanto la conexión en línea, como la entrega de los reportes de seguimiento para verificar el cumplimiento de los compromisos establecidos en cada ICA. En este sentido, se utilizarán los códigos del decreto supremo Nº 61, del año 2009, del Ministerio de Salud, o el que lo reemplace, para caracterizar los datos inválidos (calibraciones, vacíos de información, etc.). Por lo tanto, por medio de esta API, se deberán reportar todos los datos necesarios para lograr los objetivos establecidos en esta instrucción (...)".

4. En la misma línea, mediante resolución exenta Nº 1.574, de 12 de noviembre de 2020, de la SMA se aprobó la "Instrucción General para la Conexión en Línea de los Sistemas de Monitoreo Continuo de Emisiones - CEMS".

5. Asimismo, existen Instrumentos de Carácter Ambiental que establecen la obligación de reportar información en tiempo real.

6. Para tales fines, la SMA ha determinado la necesidad de definir los lineamientos técnicos para implementar el servicio API REST definido por este servicio, tanto para el envío de datos de monitoreo en línea, como para la disposición de datos históricos que puedan ser consultados.

7. Que, en atención a lo anteriormente expuesto, se procede a resolver lo siguiente:

Resuelvo:

Primero: Apruébase el documento denominado "Manual API REST - SMA. Versión 1.0 - febrero 2020", cuyo texto a continuación se transcribe:

"MANUAL API REST SMA. VERSIÓN 1.0 - FEBRERO 2020"

### 1. Introducción

La Superintendencia del Medio Ambiente (SMA) tiene por objeto ejecutar, organizar y coordinar el seguimiento y fiscalización de las Resoluciones de Calificación Ambiental, de las medidas de los Planes de Prevención y/o de Descontaminación Ambiental, del contenido de las Normas de Calidad Ambiental y Normas de Emisión, y de los Planes de Manejo, cuando corresponda, y de todos aquellos otros Instrumentos de Carácter Ambiental que establezca la ley, así como imponer sanciones en caso que se constaten infracciones de su competencia.

Para ello, la SMApodrá requerir a sujetossometidos a su fiscalización y a los organismossectoriales que cumplan labores de fiscalización ambiental, la información y datos que sean necesarios para el debido cumplimiento de sus funciones. En este contexto, existen Instrumentos de Carácter Ambiental que establecen la obligación de reportar información en tiempo real, además de instrucciones de carácter general de la SMA para la conexión en línea de instrumentos de monitoreo ambiental.

El presente documento define los lineamientos técnicos para implementar el servicio API REST definido por la SMA, tanto para el envío de datos de monitoreo en línea, como para la disposición de datos históricos que puedan ser consultados.

Los conceptos y metodologías mencionadas en este documento se basan en estándares del ámbito de las tecnologías de la información, por lo que se recomienda que un profesional del área de la Informática sea quien implemente la conexión.

### 2. Glosario

. API: Interfaz de Programación deAplicaciones (del inglés Application Programming Interface), es un conjunto de subrutinas, funciones y procedimientos que ofrece un proveedor en específico para ser utilizados por otro software como una capa de abstracción. Permite la integración entre sistemas informáticos.

. CEMS: Sistema de monitoreo continuo de emisiones (continuous emissions monitoring system).

. ENDPOINT: URL que recibe o retorna información proveniente de una API.

. HTTPREQUEST: Petición mediante el protocolo HTTP que es enviada a un endpoint especifico.

. HTTP: Protocolo de transferencia de hipertexto (del inglés Hypertext Transfer Protocol). Es el protocolo de comunicación que permite las transferencias de información en la World Wide Web.

. JSON: (del inglés JavaScript Object Notation). Es un formato de texto sencillo para el intercambio de datos.(1)

. JWT: JSON Web Token. Es un estándar abierto basado en JSON para la creación de tokens de acceso que permiten la propagación de identidad y privilegios(2)

. REST: Transferencia de Estado Representacional (del inglés Representational State Transfer), es un esquema de arquitectura de software para sistemas hipermedia distribuidos. Se utiliza para describir interfaces entre sistemas que utilicen el protocolo HTTP para obtener datos o indicar la ejecución de operaciones sobre datos.

. URI: Identificador Uniforme de Recursos (del inglés Uniform Resource Identifier) se usa para identificar recursos en internet

-------------------------------------

(1) https://tools.ietf.org/html/rfc8259

(2) https://tools.ietf.org/html/rfc7519

. URL: Localizador Uniforme de Recursos (del inglés Uniform Resource Locator) se usa para localizar recursos en internet

. WWW: Red Informática Mundial (del inglés World Wide Web) es un sistema de distribución de documentos de hipertexto o hipermedia interconectados y accesibles a través de internet.

### 3. Registro de metadatos y entrega de credenciales

Los titulares que deban transmitir datos a la SMA por medio de laAPI REST tendrán que completar el registro de metadatos asociado a su escenario de monitoreo, a través del formulario dispuesto por la SMA para estos fines. Posterior a ello, el titular recibirá las credenciales de acceso para reportar sus datos a través de la API.

El registro de metadatos tiene por objetivo generar un catastro de la configuración del escenario de monitoreo, siguiendo el siguiente esquema. Esta caracterización deberá ser cargada en un formulario que la SMA dispondrá y publicará en su sitio web. Luego de revisado los antecedentes, la SMA proporcionará las credenciales para enviar datos, a través del servicio API REST, junto con los identificadores de Unidad Fiscalizable, Procesos y Dispositivos que correspondan.

.

### 4. Envío de datos en línea a SMA, vía API REST

Todos los titulares que tengan la obligación de reportar datos en línea a la SMA, deberán seguir los siguientes lineamientos para el uso del servicio API REST.

4.1. URL Base:

Todos los endpoints descritos en esta guía para reportar datos a la SMA deberán utilizar como URL base la siguiente dirección: conexiones.sma.gob.cl

4.2. Flujo de Autenticación y consumo de Endpoints de la API

Luego de completada la etapa de caracterización, el titular recibirá las credenciales que le permitirán iniciar sesión en la API, según el framework de autenticación HTTP(3). La siguiente imagen resume el flujo de la autenticación y consumo posterior de los endpoints, por medio de un token de autenticación (JWT).

.

-------------------------------------

(3) https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication

4.3.Endpoint de Autenticación

Descripción: Por medio de este endpoint el titular podrá autenticarse contra el servicio API REST, usando las credenciales proporcionadas. Si el request es correcto, retornará un token de autenticación (JWT) el cual es requerido para consumir cualquier otro endpoint de la API.

URI: /api/v1/auth

Método: POST

Request JSON:

.

Response:

. HTTP status(4): 200 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 500 Internal Server Error

. Body: JWT

Observaciones: El token obtenido por esta vía tendrá una validez de 24 horas, posterior a ello el titular deberá volver a generar el token para seguir consumiendo los endpoints de la API.

4.4. Endpoint de Registros

Descripción: Por medio de este endpoint el titular deberá reportar los datos correspondientes a los parámetros monitoreados de forma continua, según la frecuencia que corresponda. Para esto deberá construir la llamada al servicio API Rest usando los identificadores proporcionados e incluyendo la cabecera de la llamada del token de autenticación.

URI: /api/v1/ufs/<UFld>/procesos/<Procesold>/registros

Método: Post

Header:

.

Request Array JSON:

.

-------------------------------------

(4) https://tools.ietf.org/html/rfc2616#section-10.2.1

Ejemplo Request Array JSON:

.

Response:

. HTTP Status(5): 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 500 Internal Server Error

. Response Body: JSON

Observaciones:

Se deberán enviar todos los parámetros que tengan una misma estampa de tiempo en una única llamada al endpoint, a través del arreglo JSON a construir. Esto será validado por la API al momento de recibir cada llamada, devolviendo error (HTTP status 400) en caso de faltar o exceder la cantidad de parámetros a cargar.

### 5. Datos históricos disponibles, vía API REST

Todos los titulares que tengan la obligación de disponer de un servicio API REST para consulta de datos históricos por parte de la SMA, deberán seguir los siguientes lineamientos al construir el servicio.

5.1.URL BASE

La URL base para laAPI REST se debe disponer por medio de un registro DNS válido para internet.

Por ejemplo:

api.midominio.com

www.midominio.com

api.midominio.net

De forma alternativa, aquellos titulares conectados a la SMA por medio de MPLS, podrán disponer una IP de su red local.

5.2. Flujo de Autenticación y consumo de endpoints de la API

El titular deberá generar credenciales de acceso a la API exclusivas para la SMA, que permitan iniciar sesión, según el framework de autenticación HTTP(6). El titular deberá disponer de un endpoint en donde reciba las credenciales a través del request JSON.

La siguiente imagen resume el flujo de la autenticación y consumo posterior de los endpoints:

.

Observaciones: La URI desplegadas en la imagen son a modo de ejemplo. El titular deberá proponer una estructura para organizar los recursos de la API, para lo cual recomendamos seguir las pautas propuestas por Microsoft(7) para la construcción de servicios API REST.

5.3. Endpoint de Autenticación

Descripción: Por medio de este endpoint la SMA podrá autenticarse contra el servicio API REST dispuesto por el titular, usando las credenciales dispuestas para este fin. El endpoint debe retornar un token de autenticación (JWT) el cual es requerido para consumir cualquier otro endpoint de la API, mediante el esquema de autenticación Bearer(8).

-------------------------------------

(5) https://tools.ietf.org/html/rfc2616#section-10.2.1

(6) https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication

(7) https://github.com/microsoft/api-guidelines/blob/vNext/Guidelines.md

(8) https://tools.ietf.org/html/rfc6750

URI: Definida por el titular

Método: POST

Request Json:

.

Response:

. HTTP Status(9): 200 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 500 Interna' Server Error

. Response Body: JWT

Observaciones: El token obtenido por esta vía debe tener una validez de 24 horas, sin la opción de refrescar el token. Pasado este plazo la SMA obtendrá un nuevo token a través de este endpoint para seguir consumiendo los endpoints de la API.

5.4. Endpoint de Registros

Descripción: Por medio de este endpoint el titular dispondrá los datos históricos de telemetría asociados al proceso del cual debe reportar a la SMA. Este método debe recibir como parámetro los identificadores de dispositivo y de fecha a consultar mediante la URI del método GET. El titular deberá retornar un JSON con los datos según la estructura determinada por la SMA. El endpoint al menos debe retornar todos los datos pertenecientes a una fecha en particular recibida como parámetro.

URI: Definida por el titular, recibe en la URI los parámetros de dispositivo y fecha a consultar

Método: GET

Response:

. HTTP Status(10): 200 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 500 Internal Server Error

. Response Body: JSON

Ejemplo Response Array JSON:

.

-------------------------------------

(9) https://tools.ietf.org/html/rfc2616#section-10.2.1

(10) https://tools.itef.org/html/rfc2616#section-10.2.1

Tabla descriptiva Campos en Response Array JSON

.

Observaciones:

Se deberán enviar todos los datos de los parámetros pertenecientes al dispositivo según la fecha de la llamada que corresponda, a través del arreglo JSON a construir.

### 6. Anexos

Las especificaciones de parámetros, unidades, estados y etiquetas estarán determinadas en los anexos que se incorporarán al presente manual, cuyas modificaciones serán comunicadas en la página web de la SMA, y en todas las plataformas digitales que ésta maneja".

Segundo: Publíquese la presente resolución en el Diario Oficial, quedando disponible el documento que aprueba la misma, en la página web del Sistema Nacional de Información de Fiscalización Ambiental: http://snifa.sma.gob.cl.

Tercero: Vigencia. La presente instrucción entrará en vigencia a contar de su fecha de publicación en el Diario Oficial.

Anótese, publíquese en el Diario Oficial, dese cumplimiento y archívese.- Emanuel Ibarra Soto, Superintendente del Medio Ambiente (S).