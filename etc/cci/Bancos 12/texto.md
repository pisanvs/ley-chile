CARTA CIRCULAR

BANCOS N° 12

FINANCIERAS N° 10

Santiago, 15 de febrero de 1988.

Señor Gerente:

FUNCIONAMIENTO EN PARALELO DEL SISTEMA DE DEUDORES. MODIFICA FORMATO DE REGISTRO DE LOS ARCHIVOS B26 (DEUDORES GENERALES), B1 (CARTERA VENDIDA AL BANCO CENTRAL) Y M45 (CREDITOS RELACIONADOS).

Con el objeto de compatibilizar el nuevo sistema de deudores con la información recibida en los formularios B26, B1 y M45, entregada por las instituciones financieras en cintas magnéticas, se ha considerado necesario realizar algunas modificaciones menores en los formatos de estos registros. Estos cambios mejorarán la operación de los sistemas durante el funcionamiento en paralelo del Sistema de Deudores.

Las instrucciones contenidas en los anexos a la presente carta circular, deben ser consideradas para el envío de la información referida al 29 de febrero de 1988.

Por otra parte, se informa a las instituciones financieras que, a partir de la información referida al 31 de marzo de 1988, no podrán entregar estos formularios en diskettes.

Sírvase hacer las anotaciones marginales correspondientes en las circulares N°s. 2.259-680, 2.233-656, 2.024-471 y 1.921-370, de 22 de mayo de 1987, 9 de febrero de 1987, 23 de agosto de 1984 y 22 de julio de 1983, respectivamente.

Saludo atentamente a Ud.,

CLAUDIO SKARMETA MAGRI

Superintendente de Bancos e

Instituciones Financieras

Subrogante

ANEXO N° 1

INFORMACION A SOLICITAR PARA EL FORMULARIO M45

En este anexo se especifica el formato de los registros del archivo con la información solicitada en el formulario M45 a través de cinta magnética. Este anexo reemplaza los anexos N°s 1 y 2 de la Circular N° 2.259-680 de 22 de mayo de 1987.

En la descripción de los campos se ha hecho referencia a las tablas del nuevo sistema de información, para evitar la duplicación de algunos antecedentes.

Por otra parte, las cantidades en pesos deben expresarse en miles.

### 1. Cambios introducidos

a) Se agrega un primer registro con información general acerca del archivo.

b) Se cambia el formato de los siguientes campos: RUT, Clasificación de riesgo y Tipo de operación.

c) La codificación del campo Estado del deudor debe corresponder con los códigos de la Tabla 7 "Estado del deudor".

d) En el campo Tipo de Operación, pueden, opcionalmente, informarse los códigos de la Tabla 24 "Tipo captaciones" o Tabla 14 "Tipo de colocaciones" dependiendo si se trata de una captación o una colocación, respectivamente.

### 2. Especificaciones técnicas

2.1. Cinta Magnética.

La cinta en que se envíe la información deberá grabarse a una densidad de 1.600 bpi. y debe ser acompañada del formulario Rotulación de Cintas debidamente llenado.

2.2. Tipos de datos.

Los tipos de datos referidos más adelante adhieren a la siguiente tabla:

.

2.3. Largo de registros.

El archivo es de registros de largo fijo de 226 bytes.

### 3. Descripción del archivo M-45

3.1. Estructura del primer registro.

El primer registro de cada uno de estos archivos contendrá información general acerca de ellos mismos, y tendrá la siguiente estructura:

1. Código de la IF ............................................... 9(3)

2. Identificación del archivo .................................... X(3)

3. Fecha o período ............................................... P(4)

4. Filler......................................................... X(216)

3.2. Definición de términos para el primer registro.

### 1. CODIGO DE LA IF

Corresponde a la identificación de la institución financiera según la codificación dada por esta Superintendencia.

### 2. IDENTIFICACION DEL ARCHIVO

Corresponde a la identificación del archivo. Debe ser "M45".

### 3. PERIODO

Corresponde al mes al que se refiere la información.

3.3. Estructura de los registros.

1. Código de la institución ................................. 9 (3)

2. R.U.T..................................................... R(9)VX(1)

3. Nombre o razón social..................................... X(39)

4. Categoría................................................. 9(1)

5. Estado del deudor ........................................ 9(1)

6. Tipo de relación ......................................... 9(1)

7. Clasificación de riesgo .................................. X(2)

8. Destino de las Colocaciones ............................ 9(2)

9. Tipo de Operación ...................................... 9(4)

10. Estado de la operación .................................. 9(1)

11. Número interno de identif................................ X(12)

12. Fecha de Otorg. o renov................................. F(6)

13. Fecha de extinción ..................................... F(6)

14. Plazo promedio de operac................................ 9(6)

15. Moneda ................................................. 9(3)

16. Monto original ......................................... 9(15)

17. Tasa de interés ........................................ 9(04)V9(02)

18. Saldo contable ......................................... 9(12)

19. Saldo contable vendido al B.C........................... 9(12)

20. Saldo moroso ........................................... 9(12)

21. Saldo en cartera vene................. ................. 9(12)

22. Int. por cobrar o pagar ................................ 9(12)

23. Intereses extracontables ............................... 9(12)

24. Reajustes extracontables ............................... 9(12)

25. Deuda directa Garant. en poder ...................... 9(12)

26. Deuda directa Garant. vendida .......................... 9(12)

3.4. Definición de término.

### 1. CODIGO DE LA IF

Corresponde a la identificación de la institución financiera según la codificación dada por esta Superintendencia.

2. RUT.

Corresponde al RUT del cliente, de acuerdo a lo establecido en la Circular N° 1.921-370 de 22 de julio de 1983.

### 3. NOMBRE O RAZON SOCIAL

Corresponde al nombre o razón social del cliente de acuerdo a lo

establecido en la Circular N? 1.921-370 de 22 de julio de 1983.

### 4. CATEGORIA

Se refiere a las categorías: Productivo, Inversión y Persona Natural. Se debe informar el código que corresponda de acuerdo a la Tabla 6 "Categoría del deudor".

### 5. ESTADO DEL DEUDOR

Se clasificará bajo este código a las empresas atendiendo a su estado financiero-legal conforme a la Tabla 7 "Estado del deudor".

### 6. TIPO DE RELACION CON LA INSTITUCION FINANCIERA

Se indicará bajo este concepto la relación que existe con la institución financiera, de acuerdo a la clasificación que se indica en la Tabla 8 "Relación deudor-IF".

### 7. CLASIFICACION DE RIESGO

Debe anotar la clasificación vigente a la fecha de corte, de acuerdo a lo establecido en la Circular N° 2.064-505 de 5 de febrero de 1985 y sus modificaciones. Para los créditos comerciales debe repetirse para cada operación la clasificación otorgada al deudor. Para el caso de los créditos de consumo e hipotecarios en letras de crédito para la vivienda, debe indicarse específicamente su clasificación. También para los créditos vendidos al Banco Central de Chile debe indicarse la clasificación que le corresponde.

Los códigos válidos son los que se indican en la Tabla 13 "Clasificación".

### 8. DESTINO DE LAS COLOCACIONES

Indica el destino de la colocación conforme a lo señalado en la Tabla 10 "Destino de las colocaciones". En el caso de una exportación o importación, ésta debe codificarse como tal y no el destino de tal operación de comercio exterior.

### 9. TIPO DE OPERACION

En este campo se informará si la operación corresponde a colocaciones o captaciones clasificadas de acuerdo a las categorías que a continuación se detallan:

Código

1 Colocaciones efectivas: Corresponde a las colocaciones contabilizadas en las partidas 1105 a 1230 del formulario MB1.

2 Colocaciones Reprogramadas: Corresponde a las colocaciones contabilizadas en las partidas 1235 a 1240 del formulario MB1.

3 Colocaciones en letras de crédito: Corresponde a las colocaciones contabilizadas en las partidas 1305 a 1315 del formulario MB1.

4 Colocaciones contingentes: Corresponde a las colocaciones contabilizadas en las partidas 1605 a 1660 del formulario MB1.

5 Captaciones y depósitos a plazo: Corresponde a las captaciones y depósitos contabilizados en las partidas 3020, 3025, 3030, 3035 y 3065 del formulario MB1.

Opcionalmente, las instituciones podrán usar la codificación de la Tabla 24 "Tipo captaciones" o Tabla 14 "Tipo de colocaciones" dependiendo si se trata de una captación o una colocación respectivamente.

### 10. ESTADO DE LA OPERACION

Indica la condición del crédito, en cuanto a si éste se encuentra vigente, moroso, vencido o extinguido. La codificación se hará conforme a la Tabla 15 "Estado del Crédito".

En el caso de operaciones en cuotas o con amortizaciones parciales, se codificará como morosa o vencida toda la operación si una de ellas se encuentra en tal situación.

Para las captaciones debe especificarse si la operación está vigente o vencida. Esta última clasificación incluye los depósitos y captaciones que ya vencieron pero que no han sido renovados o rescatados.

### 11. NUMERO INTERNO DE IDENTIFICACION

Corresponde al código que identifica en forma unívoca a la operación de crédito en la institución financiera.

En el caso que la evolución de una operación involucre a más de un documento, como es el caso de una colocación contingente que pasa a ser efectiva, lo que interesa es identificar a la operación propiamente tal y no a cada documento en particular.

### 12. FECHA DE OTORGAMIENTO O RENOVACION

Corresponde a la fecha original o a la de la última renovación de

la operación.

### 13. FECHA DE EXTINCION

Corresponde a la fecha de vencimiento final pactada en la operación.

En el caso de colocaciones reprogramadas, ella debe considerar el aumento de plazo implícito en la reprogramación, cuando se haya acordado dejar para un período posterior al vencimiento originalmente pactado, la amortización de las cuotas reprogramadas.

Para el caso de las libretas de ahorro se deberá considerar como fecha de extinción 12 meses contados desde el último día del mes en que se efectuó la apertura de la cuenta. Transcurrido el período señalado, se entenderán renovadas por 12 meses.

### 14. PLAZO PROMEDIO PONDERADO RESIDUAL DE LA OPERACION

Es el plazo promedio ponderado expresado en días que resulte de considerar el monto de cada una de las cuotas de pago de capital por vencer y el plazo de vencimiento de ellas a contar de la fecha de información. Para determinar el plazo promedio ponderado, se multiplicará el importe de cada cuota de amortización de capital, que aún no ha vencido, por su plazo residual expresado en días. Luego de sumados los productos obtenidos, el resultado se divide por el monto de capital de las cuotas por vencer. Para estos efectos, no se consideran las cuotas morosas y vencidas.

El plazo promedio ponderado residual de la operación se indicará sólo para las colocaciones.

### 15. MONEDA Y/O REAJUSTABILIDAD DE LA OPERACION

Corresponde al código que identifica la moneda en que ha sido

pactada la operación de crédito, a la cual está referido el "Monto Original de la Operación".

Los códigos pertinentes se detallan en la Tabla 1 "Monedas".

En el caso de operaciones reajustables en M/CH, el código distingue los diversos tipos de reajustabilidad.

### 16. MONTO ORIGINAL

Corresponde al monto de la operación a la "Fecha de otorgamiento o renovación", descrita en el punto 12, incluyendo los respectivos reajustes e intereses, si éstos han sido capitalizados.

Para las operaciones en moneda extranjera o reajustables se convertirá el monto de la operación al equivalente en pesos a la "Fecha de otorgamiento o renovación".

### 17. TASA DE INTERES

Se informa la tasa de interés estipulada en cada operación. Para las operaciones en pesos no reajustables, la tasa nominal se expresará referida a 30 días y en aquellas operaciones pactadas en pesos reajustables, U.F., I.V.P. o según el tipo de cambio, se informará la tasa anual convenida. Aquellas tasas de interés que se expresen sobre una base variable más un recargo, deberán informarse convertidas según el valor de la base, a la fecha respectiva. Aquellos créditos comprados a valores

distintos a su valor par deberán informarse a la tasa de descuento relevante.

### 18. SALDO CONTABLE EN PODER DE LA INSTITUCION FINANCIERA

Corresponde al saldo reajustado del crédito, incluidos los intereses por cobrar, a la fecha que se informa. Incluye los montos de cuotas morosas, y de cuotas registradas en cartera vencida. Se tendrá especial cuidado de informar los intereses y reajustes sólo hasta la fecha de vencimiento de cada cuota.

Para el caso de las captaciones corresponde al saldo reajustado de ellas incluidos los intereses por pagar a la fecha que se informa.

### 19. SALDO CONTABLE VENDIDO AL BANCO CENTRAL DE CHILE

Corresponde al saldo reajustado del crédito cedido al Banco Central de Chile incluidos los intereses por cobrar a la fecha que se informa. Incluye los montos de cuotas morosas y aquellas registradas en cartera

vencida. Se tendrá especial cuidado de informar los intereses y reajustes sólo hasta la fecha de vencimiento de cada cuota.

Esto corresponde a las partidas 9130 "Deudores por colocaciones vendidas al Banco Central con pacto de recompra", y la parte correspondiente de las partidas 9490 "Reajustes devengados de colocaciones riesgosas y cartera vendida" y 9510 "Intereses devengados de colocaciones riesgosas y cartera vendida".

### 20. SALDO MOROSO

Corresponde a aquella parte del saldo contable de la operación que está impago, mientras no haya sido traspasado a cartera vencida. Se tendrá especial cuidado de informar los intereses y reajustes sólo

hasta la fecha de vencimiento de cada cuota.

En el caso de operaciones en cuotas o con amortizaciones parciales, se informará sólo el monto correspondiente a las cuotas morosas.

### 21. SALDO EN CARTERA VENCIDA

Corresponde al monto de la operación traspasado a cartera vencida, anotado en cuentas de activo(partidas 1405 "Cartera vencida", 1410 "Dividendos hipotecarios vencidos", 1415 "Documentos vencidos adquiridos a instituciones en liquidación" y 1825 "Intereses por cobrar vencidos").

### 22. INTERESES POR COBRAR O POR PAGAR

Para el caso de los intereses por cobrar debe informarse lo contabilizado en las partidas 1805, "Intereses por cobrar de colocaciones en moneda nacional", y 1810, "Intereses por cobrar de colocaciones en moneda extranjera".

Para el caso de las captaciones, debe informarse lo contabilizado en la partida 3805 "Intereses por pagar de depósitos, captaciones y otras obligaciones".

### 23. INTERESES EXTRACONTABLES

Corresponde al saldo contabilizado en la partida 9490, referido a la operación informada.

24 REAJUSTES EXTRACONTABLES.

Corresponde al saldo contabilizado en la partida 9510, referido a la operación informada.

25. TOTAL DE LA DEUDA DIRECTA GARANTIZADA EN PODER DE LA INSTITUCION FINANCIERA.

Es aquella deuda compuesta por los créditos adeudados a la institución financiera por un deudor directo de ella y que se encuentra caucionada por garantías que sirven para los márgenes establecidos en el artículo 84 de la Ley General de Bancos.

### 26. TOTAL DE LA DEUDA DIRECTA GARANTIZADA VENDIDA AL BANCO CENTRAL DE CHILE

Es aquella deuda compuesta por los créditos adeudados a la institución financiera por un deudor directo de ella, vendida al Banco Central de Chile, y que se encuentra caucionada por garantías que sirven para los márgenes establecidos en el artículo 84 de la Ley General de Bancos.

ANEXO N° 2

DESCRIPCION DEL ARCHIVO DEL FORMULARIO B26.

En este anexo se especifica el formato de los registros del archivo con la información solicitada en el formulario B26 a través de cinta magnética. Este anexo reemplaza al anexo N° 2 de la Circular N° 1.921-370 de 22 de julio de 1983.

Por otra parte, las cantidades en pesos deben expresarse en miles.

### 1. Cambios introducidos

a) Se agrega un primer registro con información general acerca del archivo.

b) Se cambia el formato del campo RUT.

### 2. Especificaciones técnicas

2.1. Cinta magnética.

La cinta en que se envíe la información deberá grabarse a una densidad de 1.600 bpi, y debe ser acompañada del formulario Rotulación de Cintas debidamente llenado.

2.2. Tipos de datos.

Los tipos de datos referidos más adelante adhieren a la siguiente tabla:

.

2.3. Largo de registros.

El archivo es de registros de largo fijo de 113 bytes.

### 3. Descripción del archivo B-26

3.1. Estructura del primer registro.

El primer registro de cada uno de estos archivos contendrá información general acerca de ellos mismos, y tendrá la siguiente estructura:

1. Código de la IF ...................................................... 9 (3)

2. Identificación del archivo ........................................... X(3)

3. Fecha o período ...................................................... P (4)

4. Filler................................................................ X(103)

3.2. Definición de términos para el primer registro.

### 1. CODIGO DE LA IF

Corresponde a la identificación de la institución financiera según la codificación dada por esta Superintendencia.

### 2. IDENTIFICACION DEL ARCHIVO

Corresponde a la identificación del archivo. Debe ser "B26".

### 3. PERIODO

Corresponde al mes al que se refiere la información.

3.3. Estructura de los registros:

1. Código de la institución ....................................... 9(3)

2. Nombre o razón social .......................................... X(39)

3. R.U.T.......................................................... R (9) VX(1)

4. Código de región .............................................. 9 (2)

5. Código de actividad ........................................... 9 (2)

6. Deuda directa vigente M/CH .................................. 9 (8)

7. Deuda directa vigente M/E ................................... 9 (8)

8. Deuda directa vencida M/CH................................... 9 (8)

9. Deuda directa vencida M/E ..................................... 9 (8)

10. Deuda indirecta vigente M/CH y M/E................... 9 (8)

11. Deuda indirecta vencida M/CH y M/E................... 9 (8)

12. Total deuda.................................................... 9 (8)

13. Clasificación del deudor....................................... 9 (1)

ANEXO N° 3

DESCRIPCION DEL ARCHIVO DEL FORMULARIO B1

En este anexo se especifica el formato de los registros del archivo con la información solicitada en el formulario B1 a través de cinta magnética. Este anexo reemplaza el anexo N° A.l de la Circular N° 2024-271 de 23 de agosto de 1984.

Por otra parte, las cantidades en pesos deben expresarse en miles.

### 1. Cambios introducidos

a) Se agrega un primer registro con información general acerca

del archivo.

b) Se cambia el formato del campo RUT.

### 2. Especificaciones técnicas

2.1. Cinta magnética.

La cinta en que se envíe la información deberá grabarse a una densidad de 1.600 bpi. y debe ser acompañada del formulario Rotulación de Cintas debidamente llenado.

2.2. Tipos de datos.

Los tipos de datos referidos más adelante adhieren a la siguiente tabla:

.

2.3. Largo de registros.

El archivo es de registros de largo fijo de 113 bytes.

### 3. Descripción del archivo B-l

3.1. Estructura del primer registro.

El primer registro de cada uno de estos archivos contendrá in formación general acerca de ellos mismos, y tendrá la siguiente estructura:

1. Código de la IF ..................................................... 9 (3)

2. Identificación del archivo .......................................... X(3)

3. Fecha o período ..................................................... P (4)

4. Filler .............................................................. X(103)

3.2. Definición de términos para el primer registro.

### 1. CODIGO DE LA IF

Corresponde a la identificación de la institución financiera según la codificación dada por esta Superintendencia.

### 2. IDENTIFICACION DEL ARCHIVO

Corresponde a la identificación del archivo. Debe ser "Bl".

### 3. PERIODO

Corresponde al mes al que se refiere la información.

3.3. Estructura de los registros.

1. Código de la institución ...................................... 9 (3)

2. Nombre o razón social ......................................... X(39)

3. R.U.T.......................................................... R(9)VX(1)

4. Código de región ............................................ 9(2)

5. Código de actividad ......................................... 9(2)

6. Deuda directa vigente M/CH ............................ 9(8)

7. Deuda directa vigente M/E ............................ 9(8)

8. Deuda directa vencida M/CH............................ 9(8)

9. Deuda directa vencida M/E ............................ 9(8)

10. Filler ...................................................... X(16)

11. Total deuda ................................................... 9(8)

12. Clasificación del deudor ...................................... 9(1)