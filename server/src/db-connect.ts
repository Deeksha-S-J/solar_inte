import pg from 'pg';
const { Client } = pg;

// Connection string from the user
const connectionString = 'postgresql://neondb_owner:npg_jle5YZdO0ICf@ep-wispy-dust-a1fdj9wj-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function connectToDatabase() {
  const client = new Client({
    connectionString,
  });

  try {
    console.log('Connecting to Neon PostgreSQL database...');
    await client.connect();
    console.log('✓ Connected to database successfully!');

    // Query to list all tables
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    
    const tablesResult = await client.query(tablesQuery);
    console.log('\n📊 Tables in database:');
    console.log('----------------------');
    tablesResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.table_name}`);
    });

    // Get database version
    const versionQuery = 'SELECT version();';
    const versionResult = await client.query(versionQuery);
    console.log('\n📋 Database Version:');
    console.log('--------------------');
    console.log(`  ${versionResult.rows[0].version}`);

    // Get table counts
    console.log('\n📈 Table Row Counts:');
    console.log('---------------------');
    for (const row of tablesResult.rows) {
      const countQuery = `SELECT COUNT(*) as count FROM "${row.table_name}"`;
      try {
        const countResult = await client.query(countQuery);
        console.log(`  ${row.table_name}: ${countResult.rows[0].count} rows`);
      } catch (e) {
        console.log(`  ${row.table_name}: Unable to get count`);
      }
    }

    console.log('\n✅ Database connection and inspection complete!');
  } catch (error) {
    console.error('❌ Error connecting to database:', error);
  } finally {
    await client.end();
  }
}

connectToDatabase();
