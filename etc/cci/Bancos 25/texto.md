CARTA CIRCULAR

BANCOS N° 25

FINANCIERAS N° 21

Santiago, 28 de octubre de 1999.

Señor Gerente:

Informacion de deudores. Rectificaciones a la informacion refundida de deudas.

Esta Superintendencia ha resuelto establecer el siguiente procedimiento para

procesar las rectificaciones requeridas por las instituciones financieras a las

bases de datos que contienen la información refundida de deudas en el sistema

financiero:

a) Las rectificaciones a los datos correspondientes a un deudor serán informadas

a esta Superintendencia mediante el "Formulario rectificación de antecedentes

del archivo D01" cuyo formato e instrucciones se adjuntan a esta Carta Circular.

Estos formularios se enviarán con una carta cada vez que sea necesario corregir

la información remitida en su oportunidad mediante un archivo D01. Tanto las

cartas como los formularios deberán ser firmados por el Gerente General.

b) La información rectificada será remitida por esta Superintendencia a las

instituciones financieras, por el mismo conducto utilizado para la entrega de la

información refundida. Para ese efecto se utilizará el archivo R05

"Rectificaciones a la información consolidada de deudas", cuyas especificaciones

se adjuntan.

El procedimiento indicado se aplicará a contar de esta fecha.

Saludo atentamente a Ud.,

ERNESTO LIVACIC ROJAS

Superintendente de Bancos e

Instituciones Financieras

ARCHIVO R05

CODIGO : R05

NOMBRE : RECTIFICACIONES A LA INFORMACION CONSOLIDADA DE DEUDAS

SISTEMA : DEUDORES

PERIODICIDAD : SEMANAL

Este archivo contiene información de rectificaciones de endeudamiento

consolidado de cada uno de los deudores en el Sistema Financiero.

Estructura del primer registro

.

Definición de términos

### 1. FILLER

### 2. IDENTIFICACION DEL ARCHIVO:

Corresponde al código que identifica el archivo. Es "R05".

### 3. FECHA DE GENERACION:

Corresponde a la fecha de generación de este archivo de actualizaciones, en

formato aaaammdd.

### 4. TOTAL DEUDORES:

Es el número total de deudores incluidos en el Libro. Equivale al número de

registros grabados en la cinta, sin contar el registro inicial (header).

### 5. NOMBRE INFORMACION:

Es el nombre del archivo, "Rectificaciones a Libro de Deudores y Castigos".

### 6. FILLER

Estructura de los registros

.

Definición de términos

### 1. PERIODO DE REFERENCIA

Corresponde al periodo de referencia de los datos ya entregados anteriormente en

archivo R04.

2. RUT.

Es el Rut del deudor para el cual se entrega la información.

### 3. NOMBRE DEL DEUDOR:

Corresponde al nombre o razón social del deudor.

### 4. DEUDA DIRECTA VIGENTE:

Corresponde a la deuda directa, en poder de la Institución y cuyo vencimiento

aún no ha ocurrido o desde cuyo vencimiento han transcurrido menos de 30 días,

que registra el deudor en el sistema financiero, según la base de datos de esta

Superintendencia.

### 5. DEUDA DIRECTA MOROSA ENTRE 30 Y 90 DIAS:

Corresponde a la deuda directa, en poder de la Institución y desde cuyo

vencimiento han transcurrido al menos 30 días y menos de 90 días, que registra

el deudor en el sistema financiero, según la base de datos de esta

Superintendencia.

### 6. DEUDA DIRECTA VENCIDA:

Corresponde a la deuda directa vencida, en poder de la Institución, que registra

el deudor en el sistema financiero, según la base de datos de esta

Superintendencia.

### 7. DEUDA DIRECTA POR INVERSIONES FINANCIERAS:

Corresponde a la deuda directa por inversiones financieras, de conformidad con

lo dispuesto en el Nº 15 del artículo 83 de la Ley General de Bancos, en poder

de la Institución, que registra el deudor en el sistema financiero, según la

base de datos de esta Superintendencia.

### 8. DEUDA DIRECTA POR OPERACIONES CON PACTO:

Corresponde al valor actual de las obligaciones como vendedor de los documentos,

por compras con pacto de las Instituciones, que registra el deudor en el sistema

financiero, según la base de datos de esta Superintendencia.

### 9. DEUDA INDIRECTA VIGENTE:

Corresponde a la deuda indirecta no vencida, en poder de la Institución, que

registra el deudor en el sistema financiero, según la base de datos de esta

Superintendencia.

### 10. DEUDA INDIRECTA VENCIDA:

Corresponde a la deuda indirecta vencida, en poder de la Institución, que

registra el deudor en el sistema financiero, según la base de datos de esta

Superintendencia.

### 11. DEUDA COMERCIAL

Corresponde a la deuda directa, proveniente de colocaciones comerciales,

en poder de la Institución, que registra el deudor en el sistema

financiero, según la base de datos de esta Superintendencia.

### 12. DEUDAS CREDITOS DE CONSUMO

Corresponde a la deuda directa, proveniente de los préstamos de

consumo del deudor, en poder de la Institución, que registra el

deudor en el sistema financiero, según la base de datos de esta

Superintendencia.

13. NUMERO DE INST. EN QUE REGISTRA CREDITOS DE CONSUMO.

Corresponde al número de Instituciones del sistema financiero en que el deudor

registra deudas provenientes de préstamos de consumo.

### 14. DEUDAS DE CREDITOS HIPOTECARIOS

Corresponde a la deuda directa, proveniente de los préstamos hipotecarios para

la vivienda, que se encuentra en poder de la Institución, que registra el deudor

en el sistema financiero, según la base de datos de esta Superintendencia.

### 15. SALDO DEUDA CASTIGADA DIRECTA:

Corresponde al saldo consolidado de todas las operaciones castigadas

provenientes de deudas directas, individuales o plurales, de créditos en moneda

nacional y extranjera, deducidas todas las aclaraciones efectuadas por el deudor

con relación a dichos castigos. Los créditos en moneda extranjera se expresan

por su equivalente en moneda chilena de acuerdo con el tipo de cambio de

representación contable vigente a la fecha del castigo. No incluye los créditos

condonados ni los derivados de obligaciones tipificadas en el capítulo 18-5 de

la Recopilación Actualizada de Normas.

### 16. SALDO DEUDA CASTIGADA INDIRECTA:

Corresponde al saldo consolidado de todas las operaciones castigadas

provenientes de deudas indirectas, de créditos en moneda nacional y extranjera,

deducidas todas las aclaraciones efectuadas por el deudor con relación a dichos

castigos. Los créditos en moneda extranjera se expresan por su equivalente en

moneda chilena de acuerdo con el tipo de cambio de representación contable

vigente a la fecha del castigo. No incluye los créditos condonados ni los

derivados de obligaciones tipificadas en el capítulo 18-5 de la Recopilación

Actualizada de Normas.

### 17. MONTO LINEA DE CREDITO DISPONIBLE

Corresponde a la línea de crédito vigente, no utilizada, que registra el deudor

en el sistema financiero, según la base de datos de esta Superintendencia.

(Incluye cupo disponible en tarjeta de crédito, línea de crédito de consumo,

línea de sobregiro en cuenta corriente y otros similares).

### 18. MONTO DEUDA COMERCIAL VIGENTE EN MEX

Corresponde a aquella parte de la deuda comercial vigente que registra el deudor

en el sistema financiero, que se encuentra expresada en moneda extranjera, según

la base de datos de esta Superintendencia.

### 19. MONTO DEUDA COMERCIAL VENCIDA EN MEX

Corresponde a aquella parte de la deuda comercial vencida que registra el deudor

en el sistema financiero, que se encuentra expresada en moneda extranjera, según

la base de datos de esta Superintendencia.

20-33. INSTITUCION EN QUE REGISTRA DEUDA.

Corresponde al código de cada Institución Financiera en que el deudor registre

alguna deuda vencida o castigada, directa o indirecta. No se considera las

instituciones en que el deudor no registre alguna deuda de estos tipos, aunque

registre en ella otras deudas o tenga en ella línea de crédito.

Se informa primero el código numérico de la Institución (tres dígitos) y luego

dos dígitos que indican el tipo de deuda según la tabla siguiente:

01 Deuda directa vencida

02 Deuda directa castigada

03 Deuda directa morosa entre 30 y 90 días

04 Deuda indirecta vencida

05 Deuda indirecta castigada

11 Deuda directa vencida y deuda directa castigada

12 Deuda directa vencida y deuda directa morosa entre 30 y 90 días

13 Deuda directa vencida y deuda indirecta vencida

14 Deuda directa vencida y deuda indirecta castigada

15 Deuda directa castigada y deuda directa morosa entre 30 y 90 días

16 Deuda directa castigada y deuda indirecta vencida

17 Deuda directa castigada y deuda indirecta castigada

18 Deuda directa morosa entre 30 y 90 días y deuda indirecta vencida

19 Deuda directa morosa entre 30 y 90 días y deuda indirecta castigada

20 Deuda indirecta vencida y deuda indirecta castigada

21 Deuda directa vencida, deuda directa castigada y deuda directa morosa entre

30 y 90 días

22 Deuda directa vencida, deuda directa castigada y deuda indirecta vencida

23 Deuda directa vencida, deuda directa castigada y deuda indirecta castigada

24 Deuda directa vencida, deuda directa morosa entre 30 y 90 días y deuda

indirecta vencida

25 Deuda directa vencida, deuda directa morosa entre 30 y 90 días y deuda

indirecta castigada

26 Deuda directa vencida, deuda indirecta vencida y deuda indirecta castigada

27 Deuda directa castigada, deuda directa morosa entre 30 y 90 días y deuda

indirecta vencida

28 Deuda directa castigada, deuda directa morosa entre 30 y 90 días y deuda

indirecta castigada

29 Deuda directa castigada, deuda indirecta vencida y deuda indirecta castigada

30 Deuda directa morosa entre 30 y 90 días, deuda indirecta vencida y deuda

indirecta castigada

31 Deuda directa vencida, deuda directa castigada, deuda directa morosa entre 30

y 90 días y deuda indirecta vencida

32 Deuda directa vencida, deuda directa castigada, deuda directa morosa entre 30

y 90 días y deuda indirecta castigada

33 Deuda directa vencida, deuda directa castigada, deuda indirecta vencida y

deuda indirecta castigada

34 Deuda directa vencida, deuda directa morosa entre 30 y 90 días, deuda

indirecta vencida y deuda indirecta castigada

35 Deuda directa castigada, deuda directa morosa entre 30 y 90 días, deuda

indirecta vencida y deuda indirecta castigada

36 Deuda directa vencida, deuda directa castigada, deuda directa morosa entre 30

y 90 días, deuda indirecta vencida y deuda indirecta castigada

### 34. FILLER

NOTA:

Todos los montos estarán expresados en miles de pesos.

FORMULARIO RECTIFICACION DE ANTECEDENTES DEL ARCHIVO - D01

INSTRUCCIONES PARA EL USO DEL FORMULARIO DE RECTIFICACIONES.

El "Formulario rectificación de antecedentes del archivo D01" debe ser utilizado

para informar a esta Superintendencia de las rectificaciones a la información

correspondiente a un deudor, incluida en su oportunidad en el archivo D01 que se

indique en el formulario (sección B). El deudor a que se refiere el formulario

se identificará con el nombre y el RUT (sección C).

La sección D del formulario contempla los diferentes datos que son susceptibles

de rectificarse mediante este formulario y cuyos conceptos corresponden a los

campos de los registros del archivo D01 (descritos en el Manual del Sistema de

Información).

En la columna "DICE" se indicarán los datos que se informaron y que se

rectifican, en tanto que en la columna "DEBE DECIR" se incluirán los datos

corregidos que correspondan.

Deben informarse los cambios en todos aquellos datos conexos que se ven

afectados por el problema que se supera. Por ejemplo, si se rectificara el monto

informado en el campo 7 "Deuda Directa por Créditos Comerciales en Cuentas de

Activo" y el importe de la diferencia o parte de ella correspondiera a deuda

morosa, el formulario debe incluir también la correspondiente rectificación para

el campo 23 o 24, según sea el caso. Al respecto cabe señalar que el

procesamiento de las rectificaciones admite sólo datos congruentes.