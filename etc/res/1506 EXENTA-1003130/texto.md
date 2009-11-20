SEÑALA LAS REGULACIONES Y PROCEDIMIENTOS TÉCNICOS QUE DEBERÁN CUMPLIR LAS INSTITUCIONES QUE HAGAN USO DE LAS HERRAMIENTAS INFORMÁTICAS DEL SISTEMA NACIONAL DE REGISTROS DE ADN Y LOS REQUISITOS TÉCNICOS QUE DEBERÁN CUMPLIR LOS LABORATORIOS ACREDITADOS PARA EL INGRESO DE HUELLAS GENÉTICAS AL SISTEMA

Santiago, 25 de mayo de 2009.- Hoy se resolvió lo que sigue:

Núm. 1.506 exenta.- Vistos: El DFL Nº 1/19.653 de 17 de noviembre de 2001, que fijó el texto refundido, coordinado y sistematizado de la ley Nº 18.575, Orgánica Constitucional de Bases Generales de la Administración del Estado, lo dispuesto en el artículo 7º, letras f) y u) de la ley Nº 19.477, Orgánica del Servicio de Registro Civil e Identificación, la ley Nº 19.970, que crea el Sistema Nacional de Registros de ADN y el decreto supremo Nº 634, de fecha 10 de septiembre 2008, que aprueba el Reglamento de la ley Nº 19.970; el Convenio de Cooperación entre el Ministerio de Justicia de Chile y el Federal Bureau of Investigation de los Estados Unidos de Norteamérica, suscrito con fecha 14 de noviembre de 2002, y la resolución Nº 1.600 de fecha 30 de octubre de 2008, de la Contraloría General de la República; y

Considerando:

1.- Que la ley Nº 19.970, creó el Sistema Nacional de Registros de ADN, constituido sobre la base de huellas genéticas determinadas con ocasión de una investigación criminal.

2.- Que el decreto supremo Nº 634, de Justicia, de fecha 10 de septiembre de 2008, que aprobó el Reglamento del cuerpo legal antes citado, en su artículo 42, señala que para la administración de las herramientas informáticas del sistema, el Director Nacional del SRCeI establecerá, mediante resolución, las regulaciones y procedimientos técnicos que deberán cumplir las instituciones vinculadas con éste, en los casos que resulte procedente.

3.- Que el mismo decreto, en su artículo 43, señala que para obtener la acreditación especial para el ingreso de huellas genéticas al sistema, los laboratorios respectivos deberán generar registros electrónicos de huellas genéticas determinadas, compatibles con las herramientas informáticas señaladas en el artículo 42, circunstancia que será certificada por nuestro Servicio.

Resuelvo:

1.- El software a utilizar para el registro y cotejo de las huellas genéticas es CODIS (Combined DNA Index System), versión 5.7.4 o superior.

2.- Las instituciones que hagan uso del software CODIS deberán contar con un enlace privado punto a punto de a lo menos 10 Mbps para la interconexión con el Servicio de Registro Civil e Identificación.

3.- Las estaciones de trabajo de los laboratorios que hagan uso del software CODIS deberán cumplir los siguientes requisitos:

a. Configuración con direcciones IP privadas.

b. Sin acceso a Internet.

c. El sistema operativo deberá estar adecuadamente actualizado con los últimos parches disponibles.

d. Poseer un software antivirus y contar con una política documentada para su actualización periódica con las últimas definiciones de virus disponibles.

e. Toda información que se ingrese desde algún medio externo a la estación de trabajo (CD, diskette, token USB, etc.), deberá ser revisada por el software antivirus con la finalidad de evitar la contaminación con virus informáticos.

f. No deberán poseer cuentas de usuarios locales y la clave de la cuenta "Administrador" deberá ser restringida y utilizada sólo para mantenciones especiales.

g. Sólo podrán instalarse las aplicaciones estrictamente necesarias para el correcto funcionamiento del software CODIS y no estará permitido instalar otras, a excepción de aquellas expresamente autorizadas por el SRCeI. Asimismo, las aplicaciones de audio, mensajería instantánea, video y otras incluidas por defecto en el Sistema Operativo deberán desinstalarse. El SRCeI se reserva la facultad de realizar auditorías aleatorias, con el fin de garantizar la seguridad de su red interna.

4.- Para la generación de los archivos con información referente a perfiles genéticos que serán incorporados al Sistema Nacional de Registros de ADN, los laboratorios deberán observar las especificaciones contenidas en el documento "CODIS Interface Specification (CMF 3.2), Revision 7" del Federal Bureau of Investigation (FBI), que les será proporcionado por el Servicio de Registro Civil e Identificación, con las modificaciones que se indican a continuación:

4.1. TABLA 3.1.1 "Import Header Values" (pág. 5)

Campo Valor

DESTINATIONORI CLUGF1012

SOURCELAB CLUGF1012

SUBMITBYUSERID Nombre de laboratorio usuario,

asignado por el Servicio Médico

Legal (SML)

4.2. TABLA 3.1.2: "Import Specimen Values" (págs. 6 a 9)

Campo Valor

SPECIMENID Es el identificador de una muestra en

CODIS. La composición de este código de

trece caracters es la siguiente:

Posición Descripción

1 a 8 Número de muestra para

análisis (especimen),

completado con ceros a la

izquierda. Este número es

irrepetible por

año/laboratorio.

9 a 10 Dos últimos dígitos del año en

que se determinó la huella

genética

11 a 13 Código de laboratorio,

asignado por el SML durante la

acreditación

SPECIMENCATEORY Los valores en Anexo D del

documento "CODIS

Interface..." se

reemplazarán por los

siguientes:

Alleged Father

Alleged Mother

Biological Child

Biological Father

Biological Mother

Biological Sibling

Convicted Offender

Forensic Mixture

Forensic, Unknown

Indicted Person

Maternal Relative

Missing Person

Paternal Relative

Unidentified Person

Victim, Known

Ver criterios a aplicar en la

clasificación de las muestras en

punto 4.3

CASEID Ver definición en punto 4.4

READINGBY Nombre de usuario válido, asignado

por el SML al perito del

laboratorio.

ALLELEVALUE Según tabla de rangos de alelos

válidos para cada marcador,

proporcionada por el SML

4.3. Criterios a aplicar en la

clasificación de las muestras

(campo "Specimen Category"):

Registro Categoría Criterio

Evidencias y Forensic Mixture Evidencias que

Antecedentes contengan perfiles

genéticos atribuibles

a dos o más fuentes

biológicas.

Forensic, Unknown Evidencias con

perfiles genéticos

atribuibles a sólo

una fuente biológica.

Víctimas Victim, Known Perfiles genéticos de

personas vivas o

muertas víctimas de

un delito (muestra

indubitada).

Imputados Indicted Person Perfiles genéticos

correspondientes a

personas imputadas,

ordenados ingresar al

Sistema por un

tribunal competente.

Condenados Convicted Offender Perfiles genéticos

correspondientes a

personas condenadas,

ordenados ingresar al

Sistema por un

tribunal competente.

Desaparecidos Alleged Father según antecedentes

y sus Alleged Mother según antecedentes

Familiares Biological Child según antecedentes

Biological Father según antecedentes

Biological Mother según antecedentes

Biological Sibling según antecedentes

aternal Relative según antecedentes

Paternal Relative según antecedentes

Unidentified

Person Perfil genético de

cadáveres o restos

humanos no

identificados.

Missing Person Perfil genético de

material biológico

presumiblemente

proveniente de

personas

extraviadas.

4.4. Definición del campo CASE ID

El campo Case ID entrega información sobre la investigación criminal con ocasión de la cual se solicitó incorporar un perfil genético al Sistema Nacional de Registros de ADN.

La composición de este código es la siguiente:

CASO 1:

Registros de Imputados, Condenados, Víctimas y Desaparecidos y sus Familiares y, respecto de este último Registro, sólo tratándose de los familiares de los desaparecidos (huellas genéticas asociadas a un RUN determinado).

i. Para las causas del sistema procesal penal antiguo, el Case ID estará compuesto por el año de la causa (4 dígitos), el Rol de la causa (6 dígitos), seguido del RUN (9 dígitos), terminando con cinco ceros (5 dígitos).

Posición Descripción

1 a 4 Año de la causa. Si no existe el dato, se

completará con ceros ("0000").

5 a 10 Rol de la causa, completado con ceros a la

izquierda, sin puntos.

11 a 19 RUN de la persona, completado con ceros a

la izquierda, sin puntos, sin guión y con

dígito verificador

20 a 24 Cinco ceros ("00000")

Ejemplo:

Datos Valor CASE ID

RUN condenado: 9.184.819-8 199803013209184819800000

Causa Rol 30.132 - 1998

ii. Para las causas de la Reforma Procesal Penal, el Case ID estará compuesto por el número de RUC sin dígito verificador (10 dígitos), seguido del RUN y dígito verificador (9 dígitos), terminando con el RIT, si existiera (5 dígitos). Si el RIT tuviera menos de cinco dígitos, se completará con ceros a la izquierda; si no existiera, se completarán los cinco últimos caracteres del Case ID con ceros.

Posición Descripción

1 a 10 RUC de la causa, sin puntos, sin guión,

sin dígito verificador.

11 a 19 RUN de la persona, completado con ceros a

la izquierda, sin puntos, sin guión y con

dígito verificador

20 a 24 Número de RIT, completado con ceros a la

izquierda. De no existir RIT, se

completará el campo

con cinco ceros.

Ejemplo:

Datos Valor CASE ID

RUN Condenado: 9.184.819-8 050011214809184819802542

RUC Nº 0500112148-2

RIT 2542

CASO 2:

Registros de Evidencias y Antecedentes y de Desaparecidos y sus Familiares y, respecto de este último Registro, sólo tratándose de los desaparecidos (huellas genéticas no asociadas a un RUN determinado).

i. Para las causas del sistema procesal penal antiguo, el Case ID estará compuesto por el año de la causa (4 dígitos) y el Rol de la causa (6 dígitos).

Posición Descripción

1 a 4 Año de la causa. Si no existe el dato,

se completará con ceros ("0000").

5 a 10 Rol de la causa, completado con ceros

a la izquierda, sin puntos.

Ejemplo:

Datos Valor CASE ID

Causa Rol 30.132 1970030132

Año causa: 1970

ii. Para las causas de la Reforma Procesal Penal, el Case ID estará compuesto por el número de RUC con dígito verificador (11 dígitos), seguido del RIT (5 dígitos), si existiera. Si el RIT tuviera menos de cinco dígitos, se completará con ceros a la izquierda; si no existiera, se completarán los cinco últimos caracteres del Case ID con ceros.

Posición Descripción

1 a 11 RUC de la causa, sin puntos, sin guión,

con dígito verificador

12 a 16 Número de RIT, completado con ceros a la

izquierda. De no existir RIT, se

completará el campo con cinco ceros.

Ejemplo:

Datos Valor CASE ID

RUC Nº 0500112148-2 0500112148202542

RIT 2542

RUC Nº 0500112148-2 0500112148200000

sin RIT

Anótese, comuníquese y publíquese.- Christian Behm Sepúlveda, Director Nacional.

Lo que transcribo a usted para su conocimiento y demás fines.- Verónica Pizarro Salas, Jefa Departamento Desarrollo de las Personas.