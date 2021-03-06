print("BEGIN currentop.js");

// test basic currentop functionality + querying of nested documents
t = db.jstests_currentop;
t.drop();

for (i = 0; i < 100; i++) {
    t.save({"num": i});
}

print("count:" + t.count());

function ops(q) {
    printjson(db.currentOp().inprog);
    return db.currentOp(q).inprog;
}

print("start shell");

// sleep for a second for each (of 100) documents; can be killed in between documents & test should
// complete before 100 seconds
s1 = startParallelShell("db.jstests_currentop.count( { '$where': function() { sleep(1000); } } )");

print("sleep");
sleep(1000);

print("inprog:");
printjson(db.currentOp().inprog);
print();
sleep(1);
print("inprog:");
printjson(db.currentOp().inprog);
print();

// need to wait for read to start
print("wait have some ops");
assert.soon(function() {
    return ops({"locks.Collection": "r", "ns": "test.jstests_currentop"}).length +
        ops({"locks.Collection": "R", "ns": "test.jstests_currentop"}).length >=
        1;
}, "have_some_ops");
print("ok");

s2 = startParallelShell("db.jstests_currentop.update({ '$where': function() { sleep(150); } }," +
                        " { '$inc': {num: 1} }, false, true );");

o = [];

function f() {
    o = ops({"ns": "test.jstests_currentop"});

    printjson(o);

    var writes = ops({"locks.Collection": "w", "ns": "test.jstests_currentop"}).length;

    var readops = ops({"locks.Collection": "r", "ns": "test.jstests_currentop"});
    print("readops:");
    printjson(readops);
    var reads = readops.length;

    print("total: " + o.length + " w: " + writes + " r:" + reads);

    return o.length > writes && o.length > reads;
}

print("go");

assert.soon(f, "f");

// avoid waiting for the operations to complete (if soon succeeded)
for (var i in o) {
    db.killOp(o[i].opid);
}

start = new Date();

// The operations running in the parallel shells may or may not have been killed.
s1({checkExitSuccess: false});
s2({checkExitSuccess: false});

// don't want to pass if timeout killed the js function
assert((new Date()) - start < 30000);
