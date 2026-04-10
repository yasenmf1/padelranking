-- Check all triggers on the matches table
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'matches'
ORDER BY trigger_name, event_manipulation;
