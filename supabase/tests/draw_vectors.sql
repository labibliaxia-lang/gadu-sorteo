-- =====================================================================
-- Vectores fijos de verificación del sorteo
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase para comprobar que la fórmula de la
-- base coincide con la del navegador y con lib/draw-verify.test.ts.
-- Si algo falla, lanza una excepción con el valor inesperado.
-- =====================================================================

do $$
declare
  v_raffle uuid := '11111111-1111-4111-8111-111111111111';
  v_seed text := repeat('0123456789abcdef', 4);
  v_numbers text := '1,2,3,5,8,13,21,34,55,89';
  v_count integer := 10;
  v_commitment text;
  v_numbers_hash text;
  v_pick text;
  v_index bigint;
  v_winner integer;
  v_result_hash text;
  v_expected_commitment constant text :=
    '7ccb844285ecad2e97d871d451a2be62bf65d656db7bbc5e2eed0d98f6861eca';
  v_expected_numbers_hash constant text :=
    'ddc1ff15e29b1cba46f6073b7d68c01b6af6d362d0366cb4b327c24e33610561';
  v_expected_result_hash constant text :=
    'ed4a7e966c9f80e1f35ae7d15d8d32010925b4d5902293dd52b4ab671dccfe53';
begin
  v_commitment := encode(
    sha256(convert_to(
      'gadu:v1|raffle:' || v_raffle::text || '|seed:' || v_seed,
      'UTF8'
    )),
    'hex'
  );

  v_numbers_hash := encode(
    sha256(convert_to(
      'gadu:v1|raffle:' || v_raffle::text || '|numbers:' || v_numbers,
      'UTF8'
    )),
    'hex'
  );

  v_pick := encode(
    sha256(convert_to(
      'gadu:v1|raffle:' || v_raffle::text || '|seed:' || v_seed ||
        '|numbers:' || v_numbers,
      'UTF8'
    )),
    'hex'
  );

  v_index := ('x' || substr(v_pick, 1, 15))::bit(60)::bigint % v_count;
  v_winner := (string_to_array(v_numbers, ','))[v_index + 1]::int;

  v_result_hash := encode(
    sha256(convert_to(
      'gadu:v1|raffle:' || v_raffle::text || '|winner:' ||
        v_winner::text || '|numbers:' || v_numbers,
      'UTF8'
    )),
    'hex'
  );

  if v_commitment <> v_expected_commitment then
    raise exception 'commitment inesperado: %', v_commitment;
  end if;

  if v_numbers_hash <> v_expected_numbers_hash then
    raise exception 'numbers_hash inesperado: %', v_numbers_hash;
  end if;

  if v_winner <> 8 or v_index <> 4 then
    raise exception 'ganador inesperado: % (índice %)', v_winner, v_index;
  end if;

  if v_result_hash <> v_expected_result_hash then
    raise exception 'result_hash inesperado: %', v_result_hash;
  end if;
end;
$$;

select 'OK: los vectores del sorteo coinciden' as resultado;
